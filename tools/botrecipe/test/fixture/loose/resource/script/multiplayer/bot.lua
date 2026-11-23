local function f(txt)
	for m in string.gmatch(txt, "Loading map '([^']+)'") do last = m end
	return last
end
local function g(txt, name)
	if string.find(txt, "Not found - " .. name, 1, true) then return "missing" end
end
