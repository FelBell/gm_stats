-- TTT Stats Collector
-- Server-side only

if not SERVER then return end

-- ConVars
local cv_api_url = CreateConVar("ttt_stats_api_url", "http://localhost:5000/api/collect", FCVAR_ARCHIVE, "URL of the TTT Stats API")
local cv_api_key = CreateConVar("ttt_stats_api_key", "my_secret_api_key", FCVAR_ARCHIVE, "API Key for TTT Stats API")
-- cv_server_id is no longer needed for payload, but keeping it if users want to keep the convar around doesn't hurt.
-- However, plan said "Remove server_id from the payload". I'll remove the ConVar usage in payload.

-- Internal State
local current_round = {}

-- Helper to generate UUID v4
local function GenerateUUID()
    local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    return string.gsub(template, "[xy]", function (c)
        local v = (c == "x") and math.random(0, 0xf) or math.random(8, 0xb)
        return string.format("%x", v)
    end)
end

-- Helper to get role string
local function GetRoleName(ply)
    if not IsValid(ply) then return "none" end
    -- Check if TTT functions exist
    if not ply.GetRole then return "unknown" end

    local role = ply:GetRole()
    if role == ROLE_TRAITOR then return "traitor" end
    if role == ROLE_DETECTIVE then return "detective" end
    if role == ROLE_INNOCENT then return "innocent" end

    -- Fallback for custom roles or unknown
    return "role_" .. tostring(role)
end

-- Helper to collect all current player roles
local function CollectPlayerRoles()
    local roles = {}
    for _, ply in ipairs(player.GetAll()) do
        if IsValid(ply) then
            table.insert(roles, {
                player_steamid = ply:SteamID(),
                role = GetRoleName(ply)
            })
        end
    end
    return roles
end

local function ResetRound()
    current_round = {
        round_id = GenerateUUID(),
        kills = {},
        buys = {},
        start_time = os.time(),
        map = game.GetMap(),
        start_roles = CollectPlayerRoles()
    }
    print("[TTT Stats] Round tracking started. ID: " .. current_round.round_id)
end

-- Hooks

-- 1. Round Start
hook.Add("TTTBeginRound", "TTTStats_BeginRound", function()
    ResetRound()
end)

-- 2. Player Death
hook.Add("PlayerDeath", "TTTStats_PlayerDeath", function(victim, inflictor, attacker)
    -- Only track if we are in a tracked round
    if not current_round.start_time then return end

    -- Only track if victim is a player
    if not IsValid(victim) or not victim:IsPlayer() then return end

    local kill_info = {
        victim_steamid = victim:SteamID(),
        victim_role = GetRoleName(victim),
        headshot = (victim:LastHitGroup() == HITGROUP_HEAD)
    }

    if IsValid(attacker) and attacker:IsPlayer() then
        kill_info.attacker_steamid = attacker:SteamID()
        kill_info.attacker_role = GetRoleName(attacker)

        -- Try to get active weapon
        local wep = attacker:GetActiveWeapon()
        if IsValid(wep) then
            kill_info.weapon = wep:GetClass()
        else
            kill_info.weapon = "unknown"
        end
    else
        -- World or entity kill
        kill_info.attacker_steamid = nil
        kill_info.attacker_role = nil

        if IsValid(inflictor) then
            kill_info.weapon = inflictor:GetClass()
        else
            kill_info.weapon = "world"
        end
    end

    -- Initialize kills table if missing (safety)
    if not current_round.kills then current_round.kills = {} end

    table.insert(current_round.kills, kill_info)
end)

-- 3. Equipment Buy
hook.Add("TTTOrderedEquipment", "TTTStats_Buy", function(ply, equipment, is_item)
    -- Only track if we are in a tracked round
    if not current_round.start_time then return end

    if not IsValid(ply) or not ply:IsPlayer() then return end

    local buy_info = {
        steam_id = ply:SteamID(),
        role = GetRoleName(ply),
        item = tostring(equipment)
    }

    if not current_round.buys then current_round.buys = {} end
    table.insert(current_round.buys, buy_info)
end)

-- 4. Round End
hook.Add("TTTEndRound", "TTTStats_EndRound", function(result)
    if not current_round.start_time then return end

    local duration = os.time() - current_round.start_time

    -- Map result enum to string
    local winner = "unknown"
    if result == WIN_TRAITOR then winner = "traitors" end
    if result == WIN_INNOCENT then winner = "innocents" end
    if result == WIN_TIMELIMIT then winner = "timelimit" end

    local end_roles = CollectPlayerRoles()

    local payload = {
        round_id = current_round.round_id,
        map_name = current_round.map,
        winner = winner,
        duration = duration,
        start_roles = current_round.start_roles or {},
        end_roles = end_roles,
        kills = current_round.kills or {},
        buys = current_round.buys or {}
    }

    local json_body = util.TableToJSON(payload)
    local api_url = cv_api_url:GetString()

    print("[TTT Stats] Sending round data to " .. api_url)

    HTTP({
        failed = function(reason)
            print("[TTT Stats] HTTP Request Failed: " .. reason)
        end,
        success = function(code, body, headers)
            print("[TTT Stats] HTTP Request Success: " .. code)
        end,
        method = "POST",
        url = api_url,
        body = json_body,
        headers = {
            ["Content-Type"] = "application/json",
            ["X-Api-Key"] = cv_api_key:GetString()
        }
    })

    -- Clear data to prevent double sending or leaking
    current_round = {}
end)

print("[TTT Stats] Addon Loaded.")
