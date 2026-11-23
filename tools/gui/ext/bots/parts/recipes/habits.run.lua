-- ARSENAL bot habits runner v1. Made by the ARSENAL Bots page ("Teach the bot new habits"); the settings are in bot.habits.lua.
-- bot.main.lua loads this file AFTER bot.lua, so the stock handlers exist. Each bot event keeps ONE handler (the first Subscribe stays,
-- AI-22), so this file swaps each one with Unsubscribe + Subscribe and calls the stock On* function from its own handler: stock buying
-- goes on. Every habit runs inside pcall: an error stops the habits for the rest of the match (one line in game.log, MIS-33) and the
-- stock bot goes on. Only what the bot API gives is used (AI-12, MIS-08): Spawn, CaptureFlag, Income, EnemyHasTanks, Scene.Flags,
-- Scene.Squads, IsSquadExists, Instance, the events and the quant timer. Map positions, squad sizes and enemy squads are not readable.
-- Remove it with "Remove habits" on the Bots page (that also takes the line out of bot.main.lua).

local realApi = BotApi
local S = {}
local H = {
	t = 0, STEP = 2, off = false, ended = false, said = {}, notes = {},
	map = "", diff = "", army = "", buys = 0, lastBuy = nil,
	squadUnit = {}, miss = {}, rebuy = {}, rebuys = 0, buyId = 0, lastBuyId = nil, squadBuy = {}, buyLeft = {},
	wait = {}, waitSince = nil, wave = {}, waveTarget = nil,
	target = {}, back = {}, nextBack = 0, owner = {},
	saving = nil, nextSave = 0, hold = false,
	pick = nil, pickFor = nil, pickWhy = nil, why = nil, logPath = nil, timer = nil,
}
BotHabitsState = H

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
	say("off", "habits stopped (" .. where .. "): " .. tostring(err) .. ". The stock bot goes on.")
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

local function anyOf(list)
	if #list == 0 then return nil end
	return list[math.random(#list)]
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

-- the flag of ours closest in list order to place `from` (the first one when from is nil)
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

-- flags that are not ours and sit next to one of ours: enemy flags weigh 2, free flags 1
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

function H.note(key, text)
	if H.notes[key] ~= text then
		H.notes[key] = text
		if text then H.log(text) end
	end
end

-- ---- orders. CaptureFlag only moves a squad to a flag: there is no retreat, attack or hold order (MIS-08)
local function go(squad, name, why)
	H.target[squad] = name
	realApi.Commands:CaptureFlag(squad, name)
	H.log("squad " .. tostring(squad) .. " -> flag " .. tostring(name) .. " (" .. why .. ")")
end

-- the flag a habit wants for this squad, or nil (then the stock pick). The reason goes into H.why
function H.choose(squad)
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

local stockOrder = CaptureFlag
function H.order(squad)
	local name = nil
	if not H.off then name = guard("order", H.choose, squad) end
	if name then
		local ok, err = pcall(go, squad, name, H.why)
		if ok then return end
		stop("order", err)
	end
	-- the stock pick (the same as bot.lua's CaptureFlag), remembered for the fall back habit
	local ok, err = pcall(function()
		if type(GetFlagToCapture) == "function" and type(GetFlagPriority) == "function" then
			local f = GetFlagToCapture(realApi.Scene.Flags, GetFlagPriority)
			if f then
				H.target[squad] = f.name
				realApi.Commands:CaptureFlag(squad, f.name)
				if not H.off then H.log("squad " .. tostring(squad) .. " -> flag " .. tostring(f.name) .. " (stock pick)") end
			end
		elseif type(stockOrder) == "function" then
			stockOrder(squad)
		end
	end)
	if not ok then say("order", "the stock flag pick failed: " .. tostring(err)) end
end

-- ---- buying. Spawn says yes for a unit name it does not know (MIS-32): the page checks the names against the unit lists
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

-- what the stock buy turns into: the stock unit, or a habit's pick. false = the stock unit stays pending (it is tried next quant)
function H.decide(unit, split)
	if H.hold then return false end
	local pick, why = unit, nil
	if H.pickFor == unit and H.pick then
		pick, why = H.pick, H.pickWhy
	else
		H.pickFor, H.pick, H.pickWhy = unit, nil, nil
		if on("tanks") and realApi.Commands:EnemyHasTanks() then
			local list = unitsFor(S.tanks.units)
			local every = math.max(1, math.floor(num("tanks", "every", 2)))
			if #list > 0 and (H.buys % every) == 0 then pick, why = anyOf(list), "answer tanks" end
		end
		if not why and on("phases") then
			local r = H.rule()
			if r then
				local list = unitsFor(r.units)
				if #list > 0 and math.random(100) <= num("phases", "share", 100) then pick, why = anyOf(list), "rule " .. tostring(r.name or "") end
			end
		end
		if why then H.pick, H.pickWhy = pick, why end
	end
	local ok = realApi.Commands:Spawn(pick, split)
	if ok then
		if why then H.bought(pick, why .. ", instead of " .. tostring(unit)) else H.bought(pick, "stock list") end
		H.pickFor, H.pick, H.pickWhy = nil, nil, nil
	end
	return ok
end

function H.spawnProxy(self, unit, split)
	if H.off then return realApi.Commands:Spawn(unit, split) end
	local ok, r = pcall(H.decide, unit, split)
	if ok then return r end
	stop("buy", r)
	return realApi.Commands:Spawn(unit, split)
end

-- the stock code sees this BotApi during its Quant: the same, except that Commands:Spawn asks the habits first
local proxyCmds = setmetatable({}, {__index = function(t, k)
	if k == "Spawn" then return H.spawnProxy end
	local v = realApi.Commands[k]
	if type(v) == "function" then
		return function(self, a, b, c, d) return v(realApi.Commands, a, b, c, d) end
	end
	return v
end})
local proxy = setmetatable({Commands = proxyCmds}, {__index = realApi})

-- this quant, before the stock buy: the squad cap, a unit being saved for, re-buys. H.hold = the stock buy waits
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
	local split = MaxSquadSize or 0
	if H.saving then
		H.hold = true
		if realApi.Commands:Spawn(H.saving.unit, split) then
			H.bought(H.saving.unit, "saved up for it")
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
		H.hold = true
		local u = H.rebuy[1]
		if realApi.Commands:Spawn(u, split) then
			table.remove(H.rebuy, 1)
			H.bought(u, "replaces a lost squad")
		end
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
		if j and not H.back[squad] and not H.wait[squad] and (lost[name] or (timed and theirs(fl[j]))) then
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
				-- one buy can make two squads (one SpawnUnit -> two OnGameSpawn, ai-pages-game-checks B [V]): buy again once, when every squad
				-- of that buy is gone
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
					table.insert(H.rebuy, unit)
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
	-- the target: an enemy flag next to ours, else the enemy flag nearest (list order) to one of ours, else a free flag next to ours
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
		H.wave[squad] = true
		go(squad, target.name, "group attack")
	end
end

function H.checkSave()
	if H.saving or H.t < H.nextSave then return end
	local u = anyOf(unitsFor(S.save and S.save.units))
	if not u then return end
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
	if on("fallback") then H.fallBack(fl, lost) end
	if on("replace") then H.checkLosses() end
	if on("attack") then H.checkWave(fl) end
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

-- ---- the match log: <Documents>\my games\men of war - assault squad 2\log\bot_habits_<player>.log: the main game's log folder (instance 0)
-- always, also when the game runs as instance N (its game.log is elsewhere then; ai-pages-game-checks B [V]); outside the game
function H.openLog()
	local home = os.getenv("USERPROFILE")
	if not home then
		say("logdir", "match log: no USERPROFILE, no log this match")
		return
	end
	local pid = realApi.Instance.playerId
	if type(pid) ~= "number" then pid = 0 end
	local tries = {}
	local L = S.log
	if type(L) == "table" and type(L.docs) == "string" and L.docs ~= "" then table.insert(tries, home .. "\\" .. L.docs) end
	table.insert(tries, home .. "\\Documents")
	table.insert(tries, home .. "\\OneDrive\\Documents")
	for i, d in ipairs(tries) do
		local p = d .. "\\my games\\men of war - assault squad 2\\log\\bot_habits_" .. pid .. ".log"
		local f = io.open(p, "w")
		if f then
			f:write("ARSENAL bot habits, match log of bot player " .. pid .. "\n")
			f:close()
			H.logPath = p
			return
		end
	end
	say("logdir", "match log: the game's log folder was not found under the user profile, no log this match")
end

function H.start(args)
	if type(args) == "table" then
		H.map = tostring(args.map or "")
		H.diff = tostring(args.difficulty or "")
	end
	H.army = tostring(realApi.Instance.army or "")
	H.nextSave = num("save", "every", 5) * 60
	H.nextBack = num("fallback", "every", 4) * 60
	if on("log") then H.openLog() end
	local list = {}
	for i, k in ipairs({"attack", "fallback", "front", "replace", "tanks", "save", "phases", "cap", "log"}) do
		if on(k) then table.insert(list, k) end
	end
	H.log("match start: map " .. H.map .. ", difficulty " .. H.diff .. ", army " .. H.army .. ", habits: " .. table.concat(list, " "))
	H.arm()
end

function H.spawned(args)
	local id = type(args) == "table" and args.squadId or nil
	if id == nil then return end
	-- the squad that appears after a buy is that buy; one buy can make two squads (one SpawnUnit -> two OnGameSpawn, ai-pages-game-checks
	-- B [V]): both get the buy's name and its buy id, so a lost card is bought again once, not once per squad
	if H.lastBuy then
		H.squadUnit[id] = H.lastBuy
		if H.lastBuyId ~= nil then
			H.squadBuy[id] = H.lastBuyId
			H.buyLeft[H.lastBuyId] = (H.buyLeft[H.lastBuyId] or 0) + 1
		end
	end
	H.log("new squad " .. tostring(id) .. " (" .. tostring(H.lastBuy or "?") .. ")")
	if on("attack") then
		H.wait[id] = true
		if not H.waitSince then H.waitSince = H.t end
	end
end

function H.finish()
	H.log("match over: " .. H.buys .. " buys, " .. H.rebuys .. " re-buys")
end

-- ---- the handlers that take the stock ones' place. Each calls the stock On* function (inside pcall: a Lua error must not end a
-- mowas_2 match, MIS-33); during the stock Quant the global BotApi is the proxy above, so its buy passes H.decide
local stock = {start = OnGameStart, stop = OnGameStop, quant = OnGameQuant, spawn = OnGameSpawn}

local function callStock(name, fn, args, proxied)
	if type(fn) ~= "function" then return end
	local ok, err
	if proxied then
		BotApi = proxy
		ok, err = pcall(fn, args)
		BotApi = realApi
		if not ok then stop(name, err) end
	else
		ok, err = pcall(fn, args)
		if not ok then say("stock" .. name, "bot.lua " .. name .. " failed: " .. tostring(err)) end
	end
end

function H.onStart(args)
	callStock("OnGameStart", stock.start, args, false)
	guard("start", H.start, args)
end

function H.onQuant(args)
	if not H.off then guard("quant", ourTurn) end
	callStock("OnGameQuant", stock.quant, args, not H.off)
end

function H.onSpawn(args)
	guard("spawn", H.spawned, args)
	callStock("OnGameSpawn", stock.spawn, args, false)
end

function H.onEnd(args)
	if H.timer then
		local ok = pcall(function() realApi.Events:KillQuantTimer(H.timer) end)
		H.timer = nil
	end
	guard("end", H.finish)
	H.ended = true
	callStock("OnGameStop", stock.stop, args, false)
end

local function install()
	local ok, err = pcall(require, [[/script/multiplayer/bot.habits]])
	if not ok then
		say("settings", "bot.habits.lua could not be read: " .. tostring(err) .. ". Habits are off, the stock bot plays.")
		return
	end
	if type(BotHabits) ~= "table" then
		say("settings", "bot.habits.lua has no BotHabits table. Habits are off, the stock bot plays.")
		return
	end
	S = BotHabits
	if type(stock.start) ~= "function" or type(stock.quant) ~= "function" or type(stock.spawn) ~= "function" then
		say("nostock", "this bot.lua has no OnGameStart, OnGameQuant or OnGameSpawn: habits are off and the bot is left as it is")
		return
	end
	local E = realApi.Events
	local swaps = {
		{E.GameStart, H.onStart, stock.start},
		{E.Quant, H.onQuant, stock.quant},
		{E.GameSpawn, H.onSpawn, stock.spawn},
		{E.GameEnd, H.onEnd, stock.stop},
	}
	for i, s in ipairs(swaps) do
		if type(s[3]) == "function" then
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
	if type(stockOrder) == "function" then CaptureFlag = H.order end
	print("bot habits: on")
end

local ok, err = pcall(install)
if not ok then print("bot habits: install failed: " .. tostring(err)) end
