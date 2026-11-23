function P(t) return t:match('Starting "multi/([^:"]+)') end
BotApi.Events:Subscribe(BotApi.Events.Quant, P)
