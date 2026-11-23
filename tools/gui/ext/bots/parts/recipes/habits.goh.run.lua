-- ARSENAL bot habits runner v2 (Gates of Hell). Made by the ARSENAL Bots page ("Teach the bot new habits"); the settings are in bot.habits.lua.
-- GoH's bot.main.lua picks one mode script (modes/battlezones, frontlines, laststand, conquest) and runs it; the line the page adds at its
-- end loads this file AFTER that, so the mode's globals exist: OnGameStart, OnGameQuant, OnGameSpawn, OnGameStop (the event handlers),
-- TrySpawnUnit (the buy), CaptureFlag (the order of one squad). Each event keeps ONE handler, so this file swaps the four with
-- Unsubscribe + Subscribe and calls the mode's own function from its handler: stock buying and ordering go on (GHMIS-66: events by name).
-- Where each habit hooks in GoH:
--   cap, save, replace   TrySpawnUnit is wrapped: while a habit holds the buy, the mode buys nothing (no wait timer is started)
--   tanks, phases, log   Commands:Spawn seen by the mode during its quant asks the habits first (the mode's pick is replaced)
--   attack, fallback, front   CaptureFlag is wrapped; only in battle_zones and ammunition (battlezones.lua), on maps without waypoints;
--                        frontlines, last stand and conquest keep their own orders (lanes, roles, waves). A squad the map script holds
--                        (tags _lua_mi, _lua_alert, _lua_ignore, repairing) is always left to the mode.
--   conquest (campaign_capture_the_flag): the habits stay off, the mode's own plan plays.
-- GoH differences handled here: Spawn of an unknown unit crashes the game, so every habit buy asks IsUnitAvailable first; EnemyHasTanks is
-- gone, so "the enemy has tanks" = QueryScene armour tags of the other players; the log goes to the GoH user folder.
-- Every habit runs inside pcall: an error stops the habits for the rest of the match (one print line) and the mode's bot goes on.
-- Remove it with "Remove habits" on the Bots page (that also takes the line out of bot.main.lua).

local realApi = BotApi
local S = {}
local H = {
	t = 0, STEP = 2, off = false, ended = false, said = {}, notes = {},
	map = "", diff = "", army = "", mode = "", orders = false, buys = 0, lastBuy = nil,
	squadUnit = {}, miss = {}, rebuy = {}, rebuys = 0, buyId = 0, lastBuyId = nil, squadBuy = {}, buyLeft = {},
	wait = {}, waitSince = nil, wave = {}, waveTarget = nil,
	target = {}, back = {}, nextBack = 0, owner = {},
	saving = nil, nextSave = 0, hold = false, tanksAt = -1, tanksSeen = false,
	pick = nil, pickFor = nil, pickWhy = nil, why = nil, logPath = nil, timer = nil,
}
BotHabitsState = H

local ORDER_MODES = {battle_zones = true, ammunition = true}
local ARMOUR = {"sq_armor_light", "sq_armor_medium", "sq_armor_heavy", "sq_armor_super_heavy", "tank"}
local HELD_TAGS = {"_lua_mi", "_lua_alert", "_lua_ignore", "repairing"}

-- ---- small helpers
local function say(key, text)
	if H.said[key] then return end
	H.said[key] = true
	print("bot habits: " .. text)
end

local function clock()
	return string.format("%02d:%02d", math.floor(H.t / 60), H.t % 60)
end

function H.log(text)
	if not H.logPath then return end
	local f = io.open(H.logPath, "a")
	if not f then
		H.logPath = nil
		say("logfile", "the match log could not be opened again, no more log lines this match")
		return
	end
	f:write("[" .. clock() .. "] " .. text .. "\n")
	f:close()
end

local function stop(where, err)
	H.off = true
	say("off", "habits stopped (" .. where .. "): " .. tostring(err) .. ". The mode's bot goes on.")
	local ok = pcall(H.log, "habits stopped (" .. where .. "): " .. tostring(err))
end

local function guard(where, fn, a, b)
	if H.off then return nil end
	local ok, r = pcall(fn, a, b)
	if not ok then
		stop(where, r)
		return nil
	end
	return r
end

local function on(name)
	local h = S[name]
	return (not H.off) and type(h) == "table" and h.on == true
end

local function num(name, key, def)
	local h = S[name]
	local v = nil
	if type(h) == "table" then v = tonumber(h[key]) end
	if v == nil then return def end
	return v
end

-- the unit names of a list that this bot's army may buy (army "" = any army)
local function unitsFor(list)
	local out = {}
	if type(list) ~= "table" then return out end
	for i, u in ipairs(list) do
		if type(u) == "table" and type(u.unit) == "string" and u.unit ~= "" and (u.army == nil or u.army == "" or u.army == H.army) then
			table.insert(out, u.unit)
		end
	end
	return out
end

-- GoH: Spawn of a name the game does not know crashes the game (goh-bot-api-commands), so a habit only buys what IsUnitAvailable says yes to
local function available(unit)
	local ok, r = pcall(function() return realApi.Commands:IsUnitAvailable(unit) end)
	return ok and r == true
end

local function anyOf(list)
	local ok = {}
	for i, u in ipairs(list) do
		if available(u) then table.insert(ok, u) end
	end
	if #ok == 0 then return nil end
	return ok[math.random(#ok)]
end

-- ---- flags, in the order Scene.Flags lists them. "Next to" and "nearest" use that order: a guess, map positions are not readable
local function flags()
	local rows, out = {}, {}
	for k, f in pairs(realApi.Scene.Flags) do table.insert(rows, {k = k, f = f}) end
	table.sort(rows, function(a, b)
		if type(a.k) == type(b.k) then return a.k < b.k end
		return tostring(a.k) < tostring(b.k)
	end)
	for i, r in ipairs(rows) do table.insert(out, r.f) end
	return out
end

local function mine(f) return f.occupant == realApi.Instance.team end
local function theirs(f) return f.occupant == realApi.Instance.enemyTeam end

local function indexOf(fl, name)
	for i, f in ipairs(fl) do
		if f.name == name then return i end
	end
	return nil
end

local function nearestMine(fl, from)
	local best, bd = nil, nil
	for i, f in ipairs(fl) do
		if mine(f) then
			local d = i
			if from then d = math.abs(i - from) end
			if bd == nil or d < bd then best, bd = f, d end
		end
	end
	return best
end

local function frontier(fl)
	local out = {}
	for i, f in ipairs(fl) do
		if not mine(f) then
			local a, b = fl[i - 1], fl[i + 1]
			if (a and mine(a)) or (b and mine(b)) then
				local w = 1
				if theirs(f) then w = 2 end
				table.insert(out, {f = f, w = w})
			end
		end
	end
	return out
end

local function weighted(list)
	local total = 0
	for i, x in ipairs(list) do total = total + x.w end
	if total <= 0 then return nil end
	local r, acc = math.random() * total, 0
	for i, x in ipairs(list) do
		acc = acc + x.w
		if r < acc then return x.f end
	end
	return list[#list].f
end

local function frontFlag(fl, enemyOnly)
	local c = frontier(fl)
	if enemyOnly then
		local e = {}
		for i, x in ipairs(c) do
			if theirs(x.f) then table.insert(e, x) end
		end
		if #e > 0 then c = e end
	end
	return weighted(c)
end

local function alive()
	local n = 0
	for k, v in pairs(realApi.Scene.Squads) do n = n + 1 end
	return n
end

local function exists(squad)
	return realApi.Scene:IsSquadExists(squad)
end

-- a squad the map script or the mode holds: left to the mode
local function held(squad)
	for i, tag in ipairs(HELD_TAGS) do
		local ok, r = pcall(function() return realApi.Scene:IsSquadTagged(squad, tag) end)
		if ok and r then return true end
	end
	return false
end

-- order habits only where the mode orders by flags (battle_zones, ammunition) and the map has no waypoints (then the mode walks them)
local function ordersHere()
	if not H.orders then return false end
	local ok, w = pcall(function() return realApi.Scene.Waypoints end)
	if ok and type(w) == "table" and #w > 0 then
		say("waypoints", "this map has waypoints: the mode walks them, the order habits stay off")
		return false
	end
	return true
end

function H.note(key, text)
	if H.notes[key] ~= text then
		H.notes[key] = text
		if text then H.log(text) end
	end
end

-- ---- the enemy has tanks: QueryScene armour tags of every other player that is an enemy (Relation), refreshed every 5 s
local function enemy(pid)
	if pid == realApi.Instance.playerId then return false end
	local ok, r = pcall(function() return realApi.Instance:Relation(pid) end)
	if ok and type(r) == "string" then return string.find(string.lower(r), "enemy", 1, true) ~= nil end
	if ok and type(r) == "boolean" then return r end
	say("relation", "allies and enemies could not be told apart: the tanks of every other player count")
	return true
end

function H.enemyTanks()
	if H.tanksAt >= 0 and H.t - H.tanksAt < 5 then return H.tanksSeen end
	H.tanksAt = H.t
	H.tanksSeen = false
	local rows = realApi.Scene:QueryScene(ARMOUR, 5)
	if type(rows) ~= "table" then return false end
	for k, row in pairs(rows) do
		if type(row) == "table" and type(row[2]) == "table" and enemy(row[1]) then
			for i = 1, #ARMOUR do
				if (tonumber(row[2][i]) or 0) > 0 then H.tanksSeen = true end
			end
		end
	end
	return H.tanksSeen
end

-- ---- orders. CaptureFlag moves a squad to a flag and fights there
local function go(squad, name, why)
	H.target[squad] = name
	realApi.Commands:CaptureFlag(squad, name)
	H.log("squad " .. tostring(squad) .. " -> flag " .. tostring(name) .. " (" .. why .. ")")
end

function H.choose(squad)
	if not ordersHere() or held(squad) then return nil end
	local fl = flags()
	if #fl == 0 then return nil end
	local at = nil
	if H.target[squad] then at = indexOf(fl, H.target[squad]) end
	if H.back[squad] then
		if H.t < H.back[squad] then
			local f = nearestMine(fl, at)
			if f then
				H.why = "fall back"
				return f.name
			end
		end
		H.back[squad] = nil
	end
	if on("attack") then
		if H.wait[squad] then
			local c = frontier(fl)
			local near = nil
			if c[1] then near = indexOf(fl, c[1].f.name) end
			local f = nearestMine(fl, near)
			if f then
				H.why = "wait for the group"
				return f.name
			end
			return nil
		end
		if H.wave[squad] and H.waveTarget then
			local j = indexOf(fl, H.waveTarget)
			if j and not mine(fl[j]) then
				H.why = "group attack"
				return H.waveTarget
			end
			H.wave[squad] = nil
		end
	end
	if on("front") and math.random(100) > num("front", "any", 20) then
		local f = frontFlag(fl, false)
		if f then
			H.why = "front line"
			return f.name
		end
	end
	return nil
end

-- the proxy below: the mode sees this BotApi while its own code runs from our handlers. Spawn asks the habits first; CaptureFlag is
-- remembered (the fall back habit needs each squad's flag)
local proxy = nil
-- the BotApi that was there before is put back after the call, also when it fails (pcall catches the error, so the line after it runs)
local function asMode(fn, ...)
	local prev = BotApi
	BotApi = proxy
	local ok, err = pcall(fn, ...)
	BotApi = prev
	return ok, err
end

local stockOrder = CaptureFlag
function H.order(squad, ...)
	local name = nil
	if not H.off then name = guard("order", H.choose, squad) end
	if name then
		local ok, err = pcall(go, squad, name, H.why)
		if ok then return end
		stop("order", err)
	end
	if type(stockOrder) == "function" then
		local ok, err = asMode(stockOrder, squad, ...)
		if not ok then say("order", "the mode's flag pick failed: " .. tostring(err)) end
	end
end

-- ---- buying
function H.bought(unit, why)
	H.buys = H.buys + 1
	H.lastBuy = unit
	H.buyId = H.buyId + 1
	H.lastBuyId = H.buyId
	H.log("bought " .. tostring(unit) .. " (" .. why .. ")")
end

function H.rule()
	local P = S.phases
	if type(P) ~= "table" or type(P.rules) ~= "table" then return nil end
	for i, r in ipairs(P.rules) do
		if type(r) == "table" then
			local okMap = r.map == nil or r.map == "" or string.find(string.lower(H.map), string.lower(tostring(r.map)), 1, true) ~= nil
			local okDiff = r.difficulty == nil or r.difficulty == "" or r.difficulty == H.diff
			local from, to = tonumber(r.from) or 0, tonumber(r.to) or 0
			if okMap and okDiff and H.t >= from * 60 and (to <= 0 or H.t < to * 60) then return r end
		end
	end
	return nil
end

-- what the mode's buy turns into: the mode's unit, or a habit's pick (only one IsUnitAvailable says yes to)
function H.decide(unit, split, ...)
	local pick, why = unit, nil
	if H.pickFor == unit and H.pick and available(H.pick) then
		pick, why = H.pick, H.pickWhy
	else
		H.pickFor, H.pick, H.pickWhy = unit, nil, nil
		if on("tanks") and H.enemyTanks() then
			local every = math.max(1, math.floor(num("tanks", "every", 2)))
			if (H.buys % every) == 0 then
				local u = anyOf(unitsFor(S.tanks.units))
				if u then pick, why = u, "answer tanks" end
			end
		end
		if not why and on("phases") then
			local r = H.rule()
			if r and math.random(100) <= num("phases", "share", 100) then
				local u = anyOf(unitsFor(r.units))
				if u then pick, why = u, "rule " .. tostring(r.name or "") end
			end
		end
		if why then H.pick, H.pickWhy = pick, why end
	end
	local ok = realApi.Commands:Spawn(pick, split, ...)
	-- the real Spawn ran: spawnProxy never calls it again for this buy, even when the lines below fail
	H.spawnDone, H.spawnGot = true, ok
	if ok then
		if why then H.bought(pick, why .. ", instead of " .. tostring(unit)) else H.bought(pick, "mode's list") end
		H.pickFor, H.pick, H.pickWhy = nil, nil, nil
	end
	return ok
end

function H.spawnProxy(self, unit, split, ...)
	if H.off then return realApi.Commands:Spawn(unit, split, ...) end
	H.spawnDone, H.spawnGot = false, nil
	local ok, r = pcall(H.decide, unit, split, ...)
	if ok then return r end
	stop("buy", r)
	if H.spawnDone then return H.spawnGot end
	return realApi.Commands:Spawn(unit, split, ...)
end

function H.captureProxy(self, squad, name, ...)
	H.target[squad] = name
	return realApi.Commands:CaptureFlag(squad, name, ...)
end

local proxyCmds = setmetatable({}, {__index = function(t, k)
	if k == "Spawn" then return H.spawnProxy end
	if k == "CaptureFlag" then return H.captureProxy end
	local v = realApi.Commands[k]
	if type(v) == "function" then
		return function(self, ...) return v(realApi.Commands, ...) end
	end
	return v
end})
proxy = setmetatable({Commands = proxyCmds}, {__index = realApi})

-- a buy of our own (save, replace): only when the game lets the bot buy now; after it the mode's buy pause starts as after its own buy
local function ownBuy(unit, why)
	if not available(unit) then return false end
	local can = true
	local okC, c = pcall(function() return realApi.Commands:CanSpawn() end)
	if okC and c == false then can = false end
	if not can then return false end
	if realApi.Commands:Spawn(unit, MaxSquadSize or 0) then
		H.bought(unit, why)
		if type(SetSpawnCooldownTimer) == "function" then pcall(SetSpawnCooldownTimer) end
		return true
	end
	return false
end

-- this quant, before the mode's buy: the squad cap, a unit being saved for, re-buys. H.hold = the mode buys nothing this quant
local function ourTurn()
	H.hold = false
	if on("cap") then
		local cap = num("cap", "max", 12)
		if alive() >= cap then
			H.hold = true
			H.note("cap", "buys held: " .. cap .. " squads alive")
			return
		end
		H.note("cap", nil)
	end
	if H.saving then
		H.hold = true
		if ownBuy(H.saving.unit, "saved up for it") then
			H.saving = nil
			H.nextSave = H.t + num("save", "every", 5) * 60
		elseif H.t >= H.saving.till then
			H.log("stopped saving for " .. H.saving.unit .. " (waited too long)")
			H.saving = nil
			H.nextSave = H.t + num("save", "every", 5) * 60
		end
		return
	end
	if #H.rebuy > 0 then
		local r = H.rebuy[1]
		if H.t - r.since > 120 then
			table.remove(H.rebuy, 1)
			H.log("gave up buying " .. r.unit .. " again (not for sale for 2 minutes)")
			return
		end
		H.hold = true
		if ownBuy(r.unit, "replaces a lost squad") then table.remove(H.rebuy, 1) end
	end
end

-- ---- the 2-second timer (game time)
function H.fallBack(fl, lost)
	local mineN, theirN = 0, 0
	for i, f in ipairs(fl) do
		if mine(f) then mineN = mineN + 1 elseif theirs(f) then theirN = theirN + 1 end
	end
	local timed = false
	if H.t >= H.nextBack then
		timed = mineN < theirN
		H.nextBack = H.t + num("fallback", "every", 4) * 60
	end
	local hold = num("fallback", "hold", 60)
	for squad, name in pairs(H.target) do
		local j = indexOf(fl, name)
		if j and not H.back[squad] and not H.wait[squad] and not held(squad) and (lost[name] or (timed and theirs(fl[j]))) then
			local to = nearestMine(fl, j)
			if to then
				H.back[squad] = H.t + hold
				if lost[name] then go(squad, to.name, "fall back: flag lost") else go(squad, to.name, "fall back: the enemy holds more flags") end
			end
		end
	end
end

function H.checkLosses()
	local confirm = num("replace", "confirm", 20)
	local max = num("replace", "max", 10)
	for squad, unit in pairs(H.squadUnit) do
		if exists(squad) then
			H.miss[squad] = nil
		else
			H.miss[squad] = (H.miss[squad] or 0) + H.STEP
			if H.miss[squad] >= confirm then
				H.squadUnit[squad] = nil
				H.miss[squad] = nil
				local b = H.squadBuy[squad]
				H.squadBuy[squad] = nil
				local left = 0
				if b ~= nil then
					left = (H.buyLeft[b] or 1) - 1
					if left > 0 then H.buyLeft[b] = left else H.buyLeft[b] = nil end
				end
				if left > 0 then
					H.log("squad " .. tostring(squad) .. " (" .. unit .. ") lost: " .. left .. " more squad(s) of that buy still out, buying again when they are gone too")
				elseif H.rebuys < max then
					H.rebuys = H.rebuys + 1
					table.insert(H.rebuy, {unit = unit, since = H.t})
					H.log("squad " .. tostring(squad) .. " (" .. unit .. ") lost: buying it again")
				else
					H.log("squad " .. tostring(squad) .. " (" .. unit .. ") lost: no re-buys left this match")
				end
			end
		end
	end
end

function H.checkWave(fl)
	local n = 0
	for squad, v in pairs(H.wait) do
		if exists(squad) then n = n + 1 else H.wait[squad] = nil end
	end
	if n == 0 then
		H.waitSince = nil
		return
	end
	local size = math.max(1, num("attack", "size", 4))
	local waited = H.t - (H.waitSince or H.t)
	if n < size and waited < num("attack", "wait", 5) * 60 then return end
	local target = nil
	local c = {}
	for i, x in ipairs(frontier(fl)) do
		if theirs(x.f) then table.insert(c, x) end
	end
	target = weighted(c)
	if not target then
		local bd = nil
		for i, f in ipairs(fl) do
			if theirs(f) then
				local m = nearestMine(fl, i)
				local d = 0
				if m then d = math.abs(indexOf(fl, m.name) - i) end
				if bd == nil or d < bd then target, bd = f, d end
			end
		end
	end
	if not target then target = frontFlag(fl, false) end
	if not target then
		for i, f in ipairs(fl) do
			if not mine(f) then target = f break end
		end
	end
	local group = H.wait
	H.wait = {}
	H.waitSince = nil
	if not target then
		H.log("group of " .. n .. " squads: every flag is ours, back to normal orders")
		for squad, v in pairs(group) do H.order(squad) end
		return
	end
	H.waveTarget = target.name
	H.wave = {}
	H.log("group of " .. n .. " squads attacks flag " .. target.name)
	for squad, v in pairs(group) do
		if not held(squad) then
			H.wave[squad] = true
			go(squad, target.name, "group attack")
		end
	end
end

function H.checkSave()
	if H.saving or H.t < H.nextSave then return end
	local list = unitsFor(S.save and S.save.units)
	if #list == 0 then return end
	local u = list[math.random(#list)]
	local inc = realApi.Commands:Income(realApi.Instance.playerId)
	if type(inc) == "number" and inc >= num("save", "income", 3) then
		H.saving = {unit = u, till = H.t + num("save", "wait", 120)}
		H.log("income " .. string.format("%.1f", inc) .. " per second: saving up for " .. u)
	end
end

function H.onTick()
	local fl = flags()
	local lost = {}
	for i, f in ipairs(fl) do
		if H.owner[f.name] == realApi.Instance.team and theirs(f) then lost[f.name] = true end
		H.owner[f.name] = f.occupant
	end
	for squad, name in pairs(H.target) do
		if not exists(squad) then
			H.target[squad] = nil
			H.back[squad] = nil
			H.wave[squad] = nil
		end
	end
	local orders = ordersHere()
	if orders and on("fallback") then H.fallBack(fl, lost) end
	if on("replace") then H.checkLosses() end
	if orders and on("attack") then H.checkWave(fl) end
	if on("save") then H.checkSave() end
end

function H.arm()
	if H.ended or H.off then return end
	local ok, id = pcall(function() return realApi.Events:SetQuantTimer(H.tick, H.STEP * 1000) end)
	if ok then H.timer = id else stop("timer", id) end
end

function H.tick()
	H.timer = nil
	if H.ended or H.off then return end
	H.t = H.t + H.STEP
	guard("timer", H.onTick)
	H.arm()
end

-- ---- the match log: the GoH user folder's log\bot_habits_<player>.log: <Documents>\My Games\Gates of Hell, else
-- %LOCALAPPDATA%\digitalmindsoft\gates of hell (GoH's own rule, tools/lib/userdir gohFind)
function H.openLog()
	local home = os.getenv("USERPROFILE")
	local pid = realApi.Instance.playerId
	if type(pid) ~= "number" then pid = 0 end
	local tries = {}
	local L = S.log
	if home then
		if type(L) == "table" and type(L.docs) == "string" and L.docs ~= "" then table.insert(tries, home .. "\\" .. L.docs .. "\\My Games\\Gates of Hell") end
		table.insert(tries, home .. "\\Documents\\My Games\\Gates of Hell")
	end
	local lad = os.getenv("LOCALAPPDATA")
	if lad then table.insert(tries, lad .. "\\digitalmindsoft\\gates of hell") end
	for i, d in ipairs(tries) do
		local p = d .. "\\log\\bot_habits_" .. pid .. ".log"
		local f = io.open(p, "w")
		if f then
			f:write("ARSENAL bot habits (Gates of Hell), match log of bot player " .. pid .. "\n")
			f:close()
			H.logPath = p
			return
		end
	end
	say("logdir", "match log: the Gates of Hell log folder was not found, no log this match")
end

function H.start(args)
	if type(args) == "table" then
		H.map = tostring(args.map or "")
		H.diff = tostring(args.difficulty or "")
	end
	if H.diff == "" then H.diff = tostring(realApi.Instance.difficulty or "") end
	H.army = tostring(realApi.Instance.army or "")
	H.nextSave = num("save", "every", 5) * 60
	H.nextBack = num("fallback", "every", 4) * 60
	if on("log") then
		local okL, errL = pcall(H.openLog)
		if not okL then say("logdir", "match log: " .. tostring(errL) .. ", no log this match") end
	end
	local list = {}
	for i, k in ipairs({"attack", "fallback", "front", "replace", "tanks", "save", "phases", "cap", "log"}) do
		if on(k) then table.insert(list, k) end
	end
	local how = "order habits off in this mode"
	if H.orders then how = "order habits on" end
	H.log("match start: map " .. H.map .. ", mode " .. H.mode .. " (" .. how .. "), difficulty " .. H.diff .. ", army " .. H.army .. ", habits: " .. table.concat(list, " "))
	H.arm()
end

function H.spawned(args)
	local id = type(args) == "table" and args.squadId or nil
	if id == nil then return end
	if H.lastBuy then
		H.squadUnit[id] = H.lastBuy
		if H.lastBuyId ~= nil then
			H.squadBuy[id] = H.lastBuyId
			H.buyLeft[H.lastBuyId] = (H.buyLeft[H.lastBuyId] or 0) + 1
		end
	end
	H.log("new squad " .. tostring(id) .. " (" .. tostring(H.lastBuy or "?") .. ")")
	if on("attack") and ordersHere() and not held(id) then
		H.wait[id] = true
		if not H.waitSince then H.waitSince = H.t end
	end
end

function H.finish()
	H.log("match over: " .. H.buys .. " buys, " .. H.rebuys .. " re-buys")
end

-- ---- the handlers that take the mode's place; each calls the mode's own function (inside pcall), as the mode sees the proxy
local stock = {start = OnGameStart, stop = OnGameStop, quant = OnGameQuant, spawn = OnGameSpawn}

local function callStock(name, fn, args)
	if type(fn) ~= "function" then return end
	local ok, err
	if not H.off then
		ok, err = asMode(fn, args)
	else
		ok, err = pcall(fn, args)
	end
	if not ok then say("stock" .. name, "the mode's " .. name .. " failed: " .. tostring(err)) end
end

function H.onStart(args)
	callStock("OnGameStart", stock.start, args)
	guard("start", H.start, args)
end

function H.onQuant(args)
	if not H.off then guard("quant", ourTurn) end
	callStock("OnGameQuant", stock.quant, args)
end

function H.onSpawn(args)
	guard("spawn", H.spawned, args)
	callStock("OnGameSpawn", stock.spawn, args)
end

function H.onEnd(args)
	if H.timer then
		local ok = pcall(function() realApi.Events:KillQuantTimer(H.timer) end)
		H.timer = nil
	end
	guard("end", H.finish)
	H.ended = true
	callStock("OnGameStop", stock.stop, args)
end

local function install()
	H.mode = tostring(realApi.Instance.gameMode or "")
	if H.mode == "campaign_capture_the_flag" then
		print("bot habits: off in conquest, the mode's own plan plays")
		return
	end
	local ok, err = pcall(require, [[/script/multiplayer/bot.habits]])
	if not ok then
		say("settings", "bot.habits.lua could not be read: " .. tostring(err) .. ". Habits are off, the mode's bot plays.")
		return
	end
	if type(BotHabits) ~= "table" then
		say("settings", "bot.habits.lua has no BotHabits table. Habits are off, the mode's bot plays.")
		return
	end
	S = BotHabits
	if type(stock.start) ~= "function" or type(stock.quant) ~= "function" or type(stock.spawn) ~= "function" then
		say("nostock", "this mode script has no OnGameStart, OnGameQuant or OnGameSpawn: habits are off and the bot is left as it is")
		return
	end
	H.orders = ORDER_MODES[H.mode] == true and type(stockOrder) == "function"
	local E = realApi.Events
	local swaps = {
		{E.GameStart, H.onStart, stock.start},
		{E.Quant, H.onQuant, stock.quant},
		{E.GameSpawn, H.onSpawn, stock.spawn},
		{E.GameEnd, H.onEnd, stock.stop},
	}
	for i, s in ipairs(swaps) do
		if type(s[3]) == "function" and s[1] ~= nil then
			local ok2, err2 = pcall(function()
				E:Unsubscribe(s[1])
				E:Subscribe(s[1], s[2])
			end)
			if not ok2 then
				local ok3 = pcall(function() E:Subscribe(s[1], s[3]) end)
				stop("install", err2)
				return
			end
		end
	end
	-- the mode's buy: held while a habit holds it (no wait timer started); its squad order: the habits' pick first
	local stockTry = TrySpawnUnit
	if type(stockTry) == "function" then
		TrySpawnUnit = function()
			if H.hold and not H.off then return end
			return stockTry()
		end
	end
	if H.orders then CaptureFlag = H.order end
	print("bot habits: on (" .. H.mode .. ")")
end

local ok, err = pcall(install)
if not ok then print("bot habits: install failed: " .. tostring(err)) end
