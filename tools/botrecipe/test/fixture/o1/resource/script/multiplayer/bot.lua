local function f(txt)
	for m in string.gmatch(txt, "Loading map '([^']+)'") do last = m end
	if not last then for m in string.gmatch(txt, 'Starting "([^":]+)') do last = m end end
	return last
end
local function g(txt, name)
	if string.find(txt, "Not found - " .. name, 1, true) then S.logWorks = true; return "missing" end
end
