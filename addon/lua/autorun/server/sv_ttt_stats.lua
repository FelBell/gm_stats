-- TTT Stats Collector
-- Server-side only

if not SERVER then return end

-- ConVars
local cv_api_url = CreateConVar("ttt_stats_api_url", "https://ttt.fbell.de/api", FCVAR_ARCHIVE, "Base URL of the TTT Stats API")
local cv_api_key = CreateConVar("ttt_stats_api_key", "my_secret_api_key", FCVAR_ARCHIVE, "API Key for TTT Stats API")
-- cv_server_id is no longer needed for payload, but keeping it if users want to keep the convar around doesn't hurt.
-- However, plan said "Remove server_id from the payload". I'll remove the ConVar usage in payload.

-- Internal State
local current_round = {}

-- Mapping for vanilla TTT item IDs to names
local vanilla_item_map = {
    [1] = "Armor",
    [2] = "Radar",
    [3] = "Defuser",
    [4] = "Flare Gun",
    [5] = "Health Station",
    [6] = "Knife",
    [7] = "C4",
    [8] = "Disguiser"
}

-- Helper to format the base URL by removing any trailing slash
local function FormatBaseURL(url)
    if string.sub(url, -1) == "/" then
        return string.sub(url, 1, -2)
    end
    return url
end

-- Helper to get item name
local function GetItemName(equipment, is_item)
    if is_item then
        -- It's a numerical ID for a vanilla item
        return vanilla_item_map[equipment] or tostring(equipment)
    else
        -- It's a weapon class string
        return tostring(equipment)
    end
end

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
    if ROLE_JACKAL and role == ROLE_JACKAL then return "jackal" end
    if ROLE_SIDEKICK and role == ROLE_SIDEKICK then return "sidekick" end

    -- Fallback for custom roles or unknown
    return "role_" .. tostring(role)
end

-- Helper to collect all current player roles
-- Helper to collect all current player info (roles, karma, points).
-- This function is called at the start and end of each round to capture player stats.
local function CollectPlayerInfo()
    local players = {}
    for _, ply in ipairs(player.GetAll()) do
        if IsValid(ply) then
            table.insert(players, {
                player_steamid = ply:SteamID(),
                role = GetRoleName(ply),
                karma = ply:GetLiveKarma(),
                points = ply:GetFrags()
            })
        end
    end
    return players
end

local function ResetRound()
    current_round = {
        round_id = GenerateUUID(),
        kills = {},
        buys = {},
        start_time = os.time(),
        map = game.GetMap(),
        start_player_info = CollectPlayerInfo()
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
        item = GetItemName(equipment, is_item)
    }

    if not current_round.buys then current_round.buys = {} end
    table.insert(current_round.buys, buy_info)
end)

-- 4. Round End
-- This hook captures the state at the end of the round.
-- It collects final player information (including karma and score),
-- determines the round winner, and sends the complete dataset to the backend API.
hook.Add("TTTEndRound", "TTTStats_EndRound", function(result)
    if not current_round.start_time then return end

    local duration = os.time() - current_round.start_time

    local winner = tostring(result)
    print("[TTT Stats] Round ended with result: " .. winner)

    local end_player_info = CollectPlayerInfo()

    local payload = {
        round_id = current_round.round_id,
        map_name = current_round.map,
        winner = winner,
        duration = duration,
        start_roles = current_round.start_player_info or {},
        end_roles = end_player_info,
        kills = current_round.kills or {},
        buys = current_round.buys or {}
    }

    local json_body = util.TableToJSON(payload)
    local base_api_url = cv_api_url:GetString()
    local collect_api_url = FormatBaseURL(base_api_url) .. "/collect"

    print("[TTT Stats] Sending round data to " .. collect_api_url)

    HTTP({
        failed = function(reason)
            print("[TTT Stats] HTTP Request Failed: " .. reason)
        end,
        success = function(code, body, headers)
            print("[TTT Stats] HTTP Request Success: " .. code)
        end,
        method = "POST",
        url = collect_api_url,
        body = json_body,
        headers = {
            ["Content-Type"] = "application/json",
            ["X-Api-Key"] = cv_api_key:GetString()
        }
    })

    -- Clear data to prevent double sending or leaking
    current_round = {}
end)

hook.Add("PlayerInitialSpawn", "TTTStats_PlayerInitialSpawn", function(ply)
    if not IsValid(ply) or not ply:IsPlayer() then return end

    local payload = {
        steam_id = ply:SteamID(),
        display_name = ply:Nick()
    }

    local json_body = util.TableToJSON(payload)
    -- Construct the player update URL from the base API URL
    local base_api_url = cv_api_url:GetString()
    -- Ensure the base URL doesn't have a trailing slash, then append the new path
    local player_api_url = FormatBaseURL(base_api_url) .. "/player/update"


    print("[TTT Stats] Sending player data to " .. player_api_url)

    HTTP({
        failed = function(reason)
            print("[TTT Stats] Player update HTTP Request Failed: " .. reason)
        end,
        success = function(code, body, headers)
            print("[TTT Stats] Player update HTTP Request Success: " .. code)
        end,
        method = "POST",
        url = player_api_url,
        body = json_body,
        headers = {
            ["Content-Type"] = "application/json",
            ["X-Api-Key"] = cv_api_key:GetString()
        }
    })
end)

print("[TTT Stats] Addon Loaded.")
