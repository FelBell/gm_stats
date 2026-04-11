import {
  Component,
  signal,
  computed,
  effect,
  ElementRef,
  viewChild,
  afterNextRender,
  Injector,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { Round } from '../../models/stats.model';
import { environment } from '../../../environments/environment';
import { Chart, registerables } from 'chart.js';
import {
  LucideBarChart3,
  LucideRefreshCw,
  LucideTriangleAlert,
  LucideGamepad2,
  LucideUsers,
  LucideSkull,
  LucideClock,
  LucideMedal,
  LucideSwords,
  LucideTarget,
  LucideSword,
  LucideSparkles,
  LucideDrama,
  LucideShield,
  LucideFlame,
  LucideSearch,
  LucideDog,
  LucideBird,
  LucideHandshake,
  LucideHeartCrack,
  LucideUserPlus,
  LucideCrosshair,
  LucideShoppingCart,
  LucideStar,
  LucideMap,
  LucideFilter,
  LucideX,
  LucideTrophy,
  LucideZap,
  LucideGhost,
  LucideHeartPulse,
  LucideWrench,
  LucideSmile,
} from '@lucide/angular';

Chart.register(...registerables);

interface PlayerStats {
  steamId: string;
  displayName: string;
  roundsPlayed: number;
  kills: number;
  deaths: number;
  headshots: number;
  kd: number;
  headshotRate: number;
  winsAsInnocent: number;
  winsAsTraitor: number;
  totalWins: number;
  winRate: number;
  favoriteWeapon: string;
  itemsBought: number;
  karmaTotal: number;
  pointsTotal: number;
  rolesPlayed: Record<string, number>;
  killsPerRound: number;
  teamkills: number;
  roleStats: Record<string, { rounds: number; wins: number }>;
}

interface WeaponStats {
  weapon: string;
  kills: number;
  headshots: number;
  headshotRate: number;
}

interface MapStats {
  mapName: string;
  roundsPlayed: number;
  innocentWins: number;
  traitorWins: number;
}

interface PlayerPairStats {
  player1: string;
  player1Name: string;
  player2: string;
  player2Name: string;
  roundsTogether: number;
  winsTogether: number;
  winRate: number;
}

interface KillerVictimPair {
  killer: string;
  killerName: string;
  victim: string;
  victimName: string;
  kills: number;
  headshots: number;
}

interface RivalryStats {
  player1: string;
  player1Name: string;
  player2: string;
  player2Name: string;
  player1Kills: number;
  player2Kills: number;
  totalKills: number;
}

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    LucideBarChart3,
    LucideRefreshCw,
    LucideTriangleAlert,
    LucideGamepad2,
    LucideUsers,
    LucideSkull,
    LucideClock,
    LucideMedal,
    LucideSwords,
    LucideTarget,
    LucideSword,
    LucideSparkles,
    LucideDrama,
    LucideShield,
    LucideFlame,
    LucideSearch,
    LucideDog,
    LucideBird,
    LucideHandshake,
    LucideHeartCrack,
    LucideUserPlus,
    LucideCrosshair,
    LucideShoppingCart,
    LucideStar,
    LucideMap,
    LucideFilter,
    LucideX,
    LucideTrophy,
    LucideZap,
    LucideGhost,
    LucideHeartPulse,
    LucideWrench,
    LucideSmile,
  ],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
})
export class StatisticsComponent {
  private readonly apiUrl = environment.apiUrl;
  private readonly injector = inject(Injector);

  // Hardcoded Steam ID to Display Name mapping
  private readonly steamIdDisplayNames: Record<string, string> = {
    'STEAM_0:0:130645458': 'Señor del Mapa',
    'STEAM_0:1:619571923': 'cHoli',
    'STEAM_0:0:504917834': 'gebrochen',
    'STEAM_0:1:171849502': 'matze161',
    'STEAM_0:1:949098480': 'Der Papa',
    'STEAM_0:1:512869438': 'Toodels',
    'STEAM_0:1:39907607': 'Lumien',
    'STEAM_0:0:158949535': 'Sauron',
    'STEAM_0:1:87186570': 'sim.lie',
    'STEAM_0:0:140709318': '☭☭☭ Uppercut Ursula',
    'STEAM_0:1:94263852': 'ben.liedel',
    'STEAM_0:0:624153889': 'Mink',
    'STEAM_0:0:638665069': 'soeren.hem',
    'STEAM_0:1:597797310': 'Spinatlasagne',
  };

  // Chart refs
  weaponsChartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('weaponsChart');
  rolesChartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('rolesChart');
  mapsChartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('mapsChart');

  private charts: Chart[] = [];

  // Expanded state for various sections
  expandedSections = signal<Record<string, boolean>>({});

  toggleExpand(section: string): void {
    this.expandedSections.update((state) => ({
      ...state,
      [section]: !state[section],
    }));
  }

  isExpanded(section: string): boolean {
    return this.expandedSections()[section] ?? false;
  }

  getItems<T>(items: T[], section: string, defaultCount: number = 5): T[] {
    return this.isExpanded(section) ? items : items.slice(0, defaultCount);
  }

  // Fetch ALL rounds (use high limit)
  roundsResource = httpResource<Round[]>(() => `${this.apiUrl}/stats?limit=10000&offset=0`, {
    defaultValue: [],
  });

  loading = computed(() => this.roundsResource.isLoading());
  error = computed(() =>
    this.roundsResource.error()
      ? 'Fehler beim Laden der Statistiken. Bitte später erneut versuchen.'
      : null,
  );

  // ========== TIME-SPAN FILTER ==========
  dateFrom = signal<string | null>(null);
  dateTo = signal<string | null>(null);
  selectedSession = signal<string | null>(null);

  // Detect sessions: groups of rounds where consecutive rounds are < 2 hours apart
  sessions = computed(() => {
    const allRounds = (this.roundsResource.value() ?? []).filter((r) => r.players.length >= 6);
    if (allRounds.length === 0) return [];

    // Sort rounds by timestamp ascending
    const sorted = [...allRounds].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const GAP_MS = 2 * 60 * 60 * 1000; // 2 hours
    const sessionGroups: { start: Date; end: Date; rounds: number }[] = [];
    let sessionStart = new Date(sorted[0].timestamp);
    let sessionEnd = new Date(sorted[0].timestamp);
    let sessionRounds = 1;

    for (let i = 1; i < sorted.length; i++) {
      const roundTime = new Date(sorted[i].timestamp);
      if (roundTime.getTime() - sessionEnd.getTime() > GAP_MS) {
        // New session
        sessionGroups.push({ start: sessionStart, end: sessionEnd, rounds: sessionRounds });
        sessionStart = roundTime;
        sessionEnd = roundTime;
        sessionRounds = 1;
      } else {
        sessionEnd = roundTime;
        sessionRounds++;
      }
    }
    sessionGroups.push({ start: sessionStart, end: sessionEnd, rounds: sessionRounds });

    // Format labels — use the session start date, mapped to Thursday if applicable
    const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return sessionGroups
      .map((s) => {
        const d = s.start;
        const dayName = dayNames[d.getDay()];
        const dateStr = d.toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        return {
          label: `${dayName}, ${dateStr}`,
          startISO: s.start.toISOString(),
          endISO: s.end.toISOString(),
          rounds: s.rounds,
        };
      })
      .reverse(); // Newest first
  });

  // Computed statistics — applies date and player count filters
  rounds = computed(() => {
    const allRounds = this.roundsResource.value() ?? [];

    // Apply date range filter
    const from = this.dateFrom();
    const to = this.dateTo();
    let dateFiltered = allRounds;
    if (from) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      dateFiltered = dateFiltered.filter((r) => new Date(r.timestamp) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFiltered = dateFiltered.filter((r) => new Date(r.timestamp) <= toDate);
    }

    // Apply player count filter
    const filtered = dateFiltered.filter((r) => r.players.length >= 6);
    return filtered;
  });
  totalRounds = computed(() => this.rounds().length);
  totalKills = computed(() => this.rounds().reduce((sum, r) => sum + r.kills.length, 0));
  totalPlayers = computed(() => {
    const uniquePlayers = new Set<string>();
    this.rounds().forEach((r) => r.players.forEach((p) => uniquePlayers.add(p.steam_id)));
    return uniquePlayers.size;
  });

  // Player statistics
  playerStats = computed<PlayerStats[]>(() => {
    const rounds = this.rounds();
    const playerMap = new Map<string, PlayerStats>();

    // Initialize players from all rounds
    rounds.forEach((round) => {
      round.players.forEach((player) => {
        if (!playerMap.has(player.steam_id)) {
          playerMap.set(player.steam_id, {
            steamId: player.steam_id,
            displayName: this.getDisplayName(player.steam_id),
            roundsPlayed: 0,
            kills: 0,
            deaths: 0,
            headshots: 0,
            kd: 0,
            headshotRate: 0,
            winsAsInnocent: 0,
            winsAsTraitor: 0,
            totalWins: 0,
            winRate: 0,
            favoriteWeapon: '',
            itemsBought: 0,
            karmaTotal: 0,
            pointsTotal: 0,
            rolesPlayed: {},
            killsPerRound: 0,
            teamkills: 0,
            roleStats: {},
          });
        }
      });
    });

    // Calculate statistics
    rounds.forEach((round) => {
      const winningTeam = round.winner?.toLowerCase();

      round.players.forEach((player) => {
        const stats = playerMap.get(player.steam_id)!;
        stats.roundsPlayed++;

        // Track roles
        const role = player.role_start?.toLowerCase() || 'unknown';
        stats.rolesPlayed[role] = (stats.rolesPlayed[role] || 0) + 1;

        const roleEnd = player.role_end?.toLowerCase() || role;

        if (!stats.roleStats[role]) stats.roleStats[role] = { rounds: 0, wins: 0 };
        stats.roleStats[role].rounds++;

        if (roleEnd !== role) {
          if (!stats.roleStats[roleEnd]) stats.roleStats[roleEnd] = { rounds: 0, wins: 0 };
          stats.roleStats[roleEnd].rounds++;
        }

        // Karma and points
        if (player.karma_diff !== null) stats.karmaTotal += player.karma_diff;
        if (player.points_diff !== null) stats.pointsTotal += player.points_diff;

        // Check if player won this round
        const wonAtEnd = this.playerWon(winningTeam, roleEnd);

        if (wonAtEnd) {
          stats.totalWins++;
          if (this.isInnocentRole(roleEnd)) {
            stats.winsAsInnocent++;
          } else if (this.isTraitorRole(roleEnd)) {
            stats.winsAsTraitor++;
          }

          if (roleEnd !== role) {
            stats.roleStats[roleEnd].wins++;
          } else {
            stats.roleStats[role].wins++;
          }
        }
      });

      // Count kills and deaths
      const weaponCounts = new Map<string, Map<string, number>>();
      round.kills.forEach((kill) => {
        // Killer stats
        if (kill.attacker_steamid && playerMap.has(kill.attacker_steamid)) {
          const attackerStats = playerMap.get(kill.attacker_steamid)!;
          attackerStats.kills++;
          if (kill.headshot) attackerStats.headshots++;

          // Track weapons per player
          if (!weaponCounts.has(kill.attacker_steamid)) {
            weaponCounts.set(kill.attacker_steamid, new Map());
          }
          const playerWeapons = weaponCounts.get(kill.attacker_steamid)!;
          const weapon = kill.weapon || 'Unbekannt';
          playerWeapons.set(weapon, (playerWeapons.get(weapon) || 0) + 1);

          // Check for teamkill
          if (this.isTeamkill(kill.attacker_role, kill.victim_role)) {
            attackerStats.teamkills++;
          }
        }

        // Victim stats
        if (playerMap.has(kill.victim_steamid)) {
          playerMap.get(kill.victim_steamid)!.deaths++;
        }
      });

      // Update favorite weapons
      weaponCounts.forEach((weapons, steamId) => {
        const stats = playerMap.get(steamId)!;
        let maxWeapon = '';
        let maxCount = 0;
        weapons.forEach((count, weapon) => {
          if (count > maxCount) {
            maxCount = count;
            maxWeapon = weapon;
          }
        });
        stats.favoriteWeapon = maxWeapon;
      });

      // Count item buys
      round.buys.forEach((buy) => {
        if (playerMap.has(buy.steam_id)) {
          playerMap.get(buy.steam_id)!.itemsBought++;
        }
      });
    });

    // Calculate derived stats
    playerMap.forEach((stats) => {
      stats.kd =
        stats.deaths > 0 ? Math.round((stats.kills / stats.deaths) * 100) / 100 : stats.kills;
      stats.headshotRate =
        stats.kills > 0 ? Math.round((stats.headshots / stats.kills) * 1000) / 10 : 0;
      stats.winRate =
        stats.roundsPlayed > 0 ? Math.round((stats.totalWins / stats.roundsPlayed) * 1000) / 10 : 0;
      stats.killsPerRound =
        stats.roundsPlayed > 0 ? Math.round((stats.kills / stats.roundsPlayed) * 100) / 100 : 0;
    });

    return Array.from(playerMap.values()).sort((a, b) => b.kills - a.kills);
  });

  // Weapon statistics
  weaponStats = computed<WeaponStats[]>(() => {
    const rounds = this.rounds();
    const weaponMap = new Map<string, { kills: number; headshots: number }>();

    rounds.forEach((round) => {
      round.kills.forEach((kill) => {
        const weapon = kill.weapon || 'Unbekannt';
        if (!weaponMap.has(weapon)) {
          weaponMap.set(weapon, { kills: 0, headshots: 0 });
        }
        const stats = weaponMap.get(weapon)!;
        stats.kills++;
        if (kill.headshot) stats.headshots++;
      });
    });

    return Array.from(weaponMap.entries())
      .map(([weapon, stats]) => ({
        weapon,
        kills: stats.kills,
        headshots: stats.headshots,
        headshotRate: stats.kills > 0 ? Math.round((stats.headshots / stats.kills) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.kills - a.kills);
  });

  // Map statistics
  mapStats = computed<MapStats[]>(() => {
    const rounds = this.rounds();
    const mapMap = new Map<string, MapStats>();

    rounds.forEach((round) => {
      const mapName = round.map_name || 'Unbekannt';
      if (!mapMap.has(mapName)) {
        mapMap.set(mapName, { mapName, roundsPlayed: 0, innocentWins: 0, traitorWins: 0 });
      }
      const stats = mapMap.get(mapName)!;
      stats.roundsPlayed++;
      if (round.winner?.toLowerCase() === 'innocents') stats.innocentWins++;
      if (round.winner?.toLowerCase() === 'traitors') stats.traitorWins++;
    });

    return Array.from(mapMap.values()).sort((a, b) => b.roundsPlayed - a.roundsPlayed);
  });

  // Role distribution
  roleDistribution = computed(() => {
    const rounds = this.rounds();
    const roleCounts: Record<string, number> = {};

    rounds.forEach((round) => {
      round.players.forEach((player) => {
        const role = player.role_start?.toLowerCase() || 'unknown';
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });
    });

    return Object.entries(roleCounts)
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count);
  });

  // Top killers (by kills per round for fairness)
  topKillers = computed(() =>
    [...this.playerStats()]
      .filter((p) => p.roundsPlayed >= 5)
      .sort((a, b) => b.killsPerRound - a.killsPerRound)
      .slice(0, 5),
  );

  // Best K/D
  bestKD = computed(() =>
    [...this.playerStats()]
      .filter((p) => p.roundsPlayed >= 5)
      .sort((a, b) => b.kd - a.kd)
      .slice(0, 5),
  );

  // Best headshot rate
  bestHeadshotRate = computed(() =>
    [...this.playerStats()]
      .filter((p) => p.kills >= 10)
      .sort((a, b) => b.headshotRate - a.headshotRate)
      .slice(0, 5),
  );

  // Most teamkills
  mostTeamkills = computed(() =>
    [...this.playerStats()]
      .filter((p) => p.teamkills > 0)
      .sort((a, b) => b.teamkills - a.teamkills)
      .slice(0, 5),
  );

  // Average karma per round (best)
  avgKarmaPerRound = computed(() =>
    [...this.playerStats()]
      .filter((p) => p.roundsPlayed >= 5)
      .map((p) => ({
        ...p,
        avgKarma: Math.round((p.karmaTotal / p.roundsPlayed) * 100) / 100,
      }))
      .sort((a, b) => b.avgKarma - a.avgKarma)
      .slice(0, 5),
  );

  // Average karma per round (worst)
  worstAvgKarmaPerRound = computed(() =>
    [...this.playerStats()]
      .filter((p) => p.roundsPlayed >= 5)
      .map((p) => ({
        ...p,
        avgKarma: Math.round((p.karmaTotal / p.roundsPlayed) * 100) / 100,
      }))
      .sort((a, b) => a.avgKarma - b.avgKarma)
      .slice(0, 5),
  );

  // Specific role leaderboards
  bestInnocent = computed(() => this.getBestByRole('innocent', 5));
  bestTraitor = computed(() => this.getBestByRole('traitor', 5));
  bestDetective = computed(() => this.getBestByRole('detective', 3));
  bestJackal = computed(() => this.getBestByRole('jackal', 3));
  bestSidekick = computed(() => this.getBestByRole('sidekick', 2));

  private getBestByRole(role: string, minRounds: number) {
    return [...this.playerStats()]
      .filter((p) => (p.roleStats[role]?.rounds || 0) >= minRounds)
      .map((p) => {
        const rounds = p.roleStats[role].rounds;
        const wins = p.roleStats[role].wins;
        const wr = Math.round((wins / rounds) * 1000) / 10;
        return {
          steamId: p.steamId,
          displayName: p.displayName,
          rounds,
          wins,
          winRate: wr,
        };
      })
      .sort((a, b) => b.winRate - a.winRate || b.rounds - a.rounds)
      .slice(0, 5);
  }

  // ========== FUN SUPERLATIVES / AWARDS ==========

  funAwards = computed(() => {
    const rounds = this.rounds();
    const players = this.playerStats();
    if (rounds.length === 0 || players.length === 0) return [];

    const awards: {
      icon: string;
      title: string;
      winner: string;
      value: string;
      description: string;
      color: string;
    }[] = [];

    // 1. First Blood König — most first kills in rounds
    const firstBloodCounts = new Map<string, number>();
    rounds.forEach((round) => {
      const firstKill = round.kills.find((k) => k.attacker_steamid);
      if (firstKill?.attacker_steamid) {
        firstBloodCounts.set(
          firstKill.attacker_steamid,
          (firstBloodCounts.get(firstKill.attacker_steamid) || 0) + 1,
        );
      }
    });
    if (firstBloodCounts.size > 0) {
      const [steamId, count] = [...firstBloodCounts.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0];
      awards.push({
        icon: 'zap',
        title: 'First Blood König',
        winner: this.getDisplayName(steamId),
        value: `${count}x`,
        description: 'Erster Kill der Runde',
        color: '#f59e0b',
      });
    }

    // 2. Weltuntergang — most deaths to world/environment (no attacker)
    const worldDeathCounts = new Map<string, number>();
    rounds.forEach((round) => {
      round.kills.forEach((kill) => {
        if (!kill.attacker_steamid && kill.victim_steamid) {
          worldDeathCounts.set(
            kill.victim_steamid,
            (worldDeathCounts.get(kill.victim_steamid) || 0) + 1,
          );
        }
      });
    });
    if (worldDeathCounts.size > 0) {
      const [steamId, count] = [...worldDeathCounts.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0];
      awards.push({
        icon: 'ghost',
        title: 'Weltuntergang',
        winner: this.getDisplayName(steamId),
        value: `${count}x`,
        description: 'Tod durch die Umgebung',
        color: '#8b5cf6',
      });
    }

    // 3. Shopaholic — most shop purchases per round
    const buysPerPlayer = new Map<string, { buys: number; rounds: number }>();
    rounds.forEach((round) => {
      const playersInRound = new Set(round.players.map((p) => p.steam_id));
      playersInRound.forEach((id) => {
        if (!buysPerPlayer.has(id)) buysPerPlayer.set(id, { buys: 0, rounds: 0 });
        buysPerPlayer.get(id)!.rounds++;
      });
      round.buys.forEach((buy) => {
        if (!buysPerPlayer.has(buy.steam_id))
          buysPerPlayer.set(buy.steam_id, { buys: 0, rounds: 0 });
        buysPerPlayer.get(buy.steam_id)!.buys++;
      });
    });
    const shoppers = [...buysPerPlayer.entries()]
      .filter(([, data]) => data.rounds >= 10)
      .map(([id, data]) => ({
        id,
        perRound: Math.round((data.buys / data.rounds) * 100) / 100,
      }))
      .sort((a, b) => b.perRound - a.perRound);
    if (shoppers.length > 0) {
      awards.push({
        icon: 'shopping-cart',
        title: 'Shopaholic',
        winner: this.getDisplayName(shoppers[0].id),
        value: `${shoppers[0].perRound}/Runde`,
        description: 'Meiste Käufe pro Runde',
        color: '#10b981',
      });
    }

    // 4. One-Trick Pony — highest % of kills with a single weapon (min 20 kills)
    const playerWeaponStats = new Map<
      string,
      { total: number; weapons: Map<string, number> }
    >();
    rounds.forEach((round) => {
      round.kills.forEach((kill) => {
        if (!kill.attacker_steamid) return;
        if (!playerWeaponStats.has(kill.attacker_steamid)) {
          playerWeaponStats.set(kill.attacker_steamid, {
            total: 0,
            weapons: new Map(),
          });
        }
        const stats = playerWeaponStats.get(kill.attacker_steamid)!;
        stats.total++;
        const w = kill.weapon || 'Unbekannt';
        stats.weapons.set(w, (stats.weapons.get(w) || 0) + 1);
      });
    });
    const oneTricks = [...playerWeaponStats.entries()]
      .filter(([, s]) => s.total >= 20)
      .map(([id, s]) => {
        const topWeapon = [...s.weapons.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          id,
          weapon: topWeapon[0],
          pct: Math.round((topWeapon[1] / s.total) * 1000) / 10,
        };
      })
      .sort((a, b) => b.pct - a.pct);
    if (oneTricks.length > 0) {
      awards.push({
        icon: 'crosshair',
        title: 'One-Trick Pony',
        winner: this.getDisplayName(oneTricks[0].id),
        value: `${oneTricks[0].pct}%`,
        description: `${oneTricks[0].weapon}`,
        color: '#ef4444',
      });
    }

    // 5. Waffensammler — most different weapons used for kills (min 15 kills)
    const collectors = [...playerWeaponStats.entries()]
      .filter(([, s]) => s.total >= 15)
      .map(([id, s]) => ({ id, weaponCount: s.weapons.size, totalKills: s.total }))
      .sort((a, b) => b.weaponCount - a.weaponCount);
    if (collectors.length > 0) {
      awards.push({
        icon: 'wrench',
        title: 'Waffensammler',
        winner: this.getDisplayName(collectors[0].id),
        value: `${collectors[0].weaponCount} Waffen`,
        description: 'Verschiedene Waffen benutzt',
        color: '#06b6d4',
      });
    }

    // 6. Überlebenskünstler — lowest death rate (min 15 rounds)
    const survivors = [...players]
      .filter((p) => p.roundsPlayed >= 15)
      .map((p) => ({
        name: p.displayName,
        deathRate: Math.round((p.deaths / p.roundsPlayed) * 100) / 100,
      }))
      .sort((a, b) => a.deathRate - b.deathRate);
    if (survivors.length > 0) {
      awards.push({
        icon: 'heart-pulse',
        title: 'Überlebenskünstler',
        winner: survivors[0].name,
        value: `${survivors[0].deathRate}/Runde`,
        description: 'Niedrigste Todesrate',
        color: '#ec4899',
      });
    }

    // 7. Pazifist — most rounds with 0 kills
    const roundsWithZeroKills = new Map<string, { zeroKillRounds: number; total: number }>();
    rounds.forEach((round) => {
      const killersInRound = new Set(
        round.kills.filter((k) => k.attacker_steamid).map((k) => k.attacker_steamid!),
      );
      round.players.forEach((player) => {
        if (!roundsWithZeroKills.has(player.steam_id)) {
          roundsWithZeroKills.set(player.steam_id, { zeroKillRounds: 0, total: 0 });
        }
        const data = roundsWithZeroKills.get(player.steam_id)!;
        data.total++;
        if (!killersInRound.has(player.steam_id)) {
          data.zeroKillRounds++;
        }
      });
    });
    const pacifists = [...roundsWithZeroKills.entries()]
      .filter(([, d]) => d.total >= 15)
      .map(([id, d]) => ({
        id,
        pct: Math.round((d.zeroKillRounds / d.total) * 1000) / 10,
        count: d.zeroKillRounds,
      }))
      .sort((a, b) => b.pct - a.pct);
    if (pacifists.length > 0) {
      awards.push({
        icon: 'smile',
        title: 'Pazifist',
        winner: this.getDisplayName(pacifists[0].id),
        value: `${pacifists[0].pct}%`,
        description: `${pacifists[0].count} Runden ohne Kill`,
        color: '#a3e635',
      });
    }

    return awards;
  });

  // Average round duration
  avgRoundDuration = computed(() => {
    const rounds = this.rounds();
    if (rounds.length === 0) return 0;
    const totalDuration = rounds.reduce((sum, r) => sum + r.duration, 0);
    return Math.round(totalDuration / rounds.length);
  });

  // ========== PLAYER PAIR STATISTICS ==========

  // Best teammate duos (winrate when on same team)
  bestTeammates = computed<PlayerPairStats[]>(() => {
    const rounds = this.rounds();
    const pairMap = new Map<string, { rounds: number; wins: number }>();

    rounds.forEach((round) => {
      const winningTeam = round.winner?.toLowerCase();
      const players = round.players;

      // Group players by team
      const innocentPlayers = players.filter((p) => this.isInnocentRole(p.role_start));
      const traitorPlayers = players.filter((p) => this.isTraitorRole(p.role_start));

      // Check innocent team pairs
      for (let i = 0; i < innocentPlayers.length; i++) {
        for (let j = i + 1; j < innocentPlayers.length; j++) {
          const pair = [innocentPlayers[i].steam_id, innocentPlayers[j].steam_id].sort().join('|');
          if (!pairMap.has(pair)) pairMap.set(pair, { rounds: 0, wins: 0 });
          const stats = pairMap.get(pair)!;
          stats.rounds++;
          if (winningTeam === 'innocents') stats.wins++;
        }
      }

      // Check traitor team pairs
      for (let i = 0; i < traitorPlayers.length; i++) {
        for (let j = i + 1; j < traitorPlayers.length; j++) {
          const pair = [traitorPlayers[i].steam_id, traitorPlayers[j].steam_id].sort().join('|');
          if (!pairMap.has(pair)) pairMap.set(pair, { rounds: 0, wins: 0 });
          const stats = pairMap.get(pair)!;
          stats.rounds++;
          if (winningTeam === 'traitors') stats.wins++;
        }
      }
    });

    return Array.from(pairMap.entries())
      .filter(([, stats]) => stats.rounds >= 3) // Min 3 rounds together
      .map(([pair, stats]) => {
        const [p1, p2] = pair.split('|');
        return {
          player1: p1,
          player1Name: this.getDisplayName(p1),
          player2: p2,
          player2Name: this.getDisplayName(p2),
          roundsTogether: stats.rounds,
          winsTogether: stats.wins,
          winRate: Math.round((stats.wins / stats.rounds) * 1000) / 10,
        };
      })
      .sort((a, b) => b.winRate - a.winRate || b.roundsTogether - a.roundsTogether);
  });

  // Worst teammate duos (lowest winrate)
  worstTeammates = computed<PlayerPairStats[]>(() => {
    const rounds = this.rounds();
    const pairMap = new Map<string, { rounds: number; wins: number }>();

    rounds.forEach((round) => {
      const winningTeam = round.winner?.toLowerCase();
      const players = round.players;

      const innocentPlayers = players.filter((p) => this.isInnocentRole(p.role_start));
      const traitorPlayers = players.filter((p) => this.isTraitorRole(p.role_start));

      for (let i = 0; i < innocentPlayers.length; i++) {
        for (let j = i + 1; j < innocentPlayers.length; j++) {
          const pair = [innocentPlayers[i].steam_id, innocentPlayers[j].steam_id].sort().join('|');
          if (!pairMap.has(pair)) pairMap.set(pair, { rounds: 0, wins: 0 });
          const stats = pairMap.get(pair)!;
          stats.rounds++;
          if (winningTeam === 'innocents') stats.wins++;
        }
      }

      for (let i = 0; i < traitorPlayers.length; i++) {
        for (let j = i + 1; j < traitorPlayers.length; j++) {
          const pair = [traitorPlayers[i].steam_id, traitorPlayers[j].steam_id].sort().join('|');
          if (!pairMap.has(pair)) pairMap.set(pair, { rounds: 0, wins: 0 });
          const stats = pairMap.get(pair)!;
          stats.rounds++;
          if (winningTeam === 'traitors') stats.wins++;
        }
      }
    });

    return Array.from(pairMap.entries())
      .filter(([, stats]) => stats.rounds >= 3)
      .map(([pair, stats]) => {
        const [p1, p2] = pair.split('|');
        return {
          player1: p1,
          player1Name: this.getDisplayName(p1),
          player2: p2,
          player2Name: this.getDisplayName(p2),
          roundsTogether: stats.rounds,
          winsTogether: stats.wins,
          winRate: Math.round((stats.wins / stats.rounds) * 1000) / 10,
        };
      })
      .sort((a, b) => a.winRate - b.winRate || b.roundsTogether - a.roundsTogether);
  });

  // Most frequent killer-victim pairs (Nemesis)
  nemesisPairs = computed<KillerVictimPair[]>(() => {
    const rounds = this.rounds();
    const killMap = new Map<string, { kills: number; headshots: number }>();

    rounds.forEach((round) => {
      round.kills.forEach((kill) => {
        if (!kill.attacker_steamid || kill.attacker_steamid === kill.victim_steamid) return;
        const pair = `${kill.attacker_steamid}|${kill.victim_steamid}`;
        if (!killMap.has(pair)) killMap.set(pair, { kills: 0, headshots: 0 });
        const stats = killMap.get(pair)!;
        stats.kills++;
        if (kill.headshot) stats.headshots++;
      });
    });

    return Array.from(killMap.entries())
      .map(([pair, stats]) => {
        const [killer, victim] = pair.split('|');
        return {
          killer,
          killerName: this.getDisplayName(killer),
          victim,
          victimName: this.getDisplayName(victim),
          kills: stats.kills,
          headshots: stats.headshots,
        };
      })
      .sort((a, b) => b.kills - a.kills);
  });

  // Biggest rivalries (most mutual kills)
  rivalries = computed<RivalryStats[]>(() => {
    const rounds = this.rounds();
    const killMap = new Map<string, { p1Kills: number; p2Kills: number }>();

    rounds.forEach((round) => {
      round.kills.forEach((kill) => {
        if (!kill.attacker_steamid || kill.attacker_steamid === kill.victim_steamid) return;
        const [p1, p2] = [kill.attacker_steamid, kill.victim_steamid].sort();
        const pair = `${p1}|${p2}`;
        if (!killMap.has(pair)) killMap.set(pair, { p1Kills: 0, p2Kills: 0 });
        const stats = killMap.get(pair)!;
        if (kill.attacker_steamid === p1) {
          stats.p1Kills++;
        } else {
          stats.p2Kills++;
        }
      });
    });

    return Array.from(killMap.entries())
      .filter(([, stats]) => stats.p1Kills > 0 && stats.p2Kills > 0) // Must have mutual kills
      .map(([pair, stats]) => {
        const [p1, p2] = pair.split('|');
        return {
          player1: p1,
          player1Name: this.getDisplayName(p1),
          player2: p2,
          player2Name: this.getDisplayName(p2),
          player1Kills: stats.p1Kills,
          player2Kills: stats.p2Kills,
          totalKills: stats.p1Kills + stats.p2Kills,
        };
      })
      .sort((a, b) => b.totalKills - a.totalKills);
  });

  // Most played together (any team)
  frequentDuos = computed<PlayerPairStats[]>(() => {
    const rounds = this.rounds();
    const pairMap = new Map<string, number>();

    rounds.forEach((round) => {
      const players = round.players;
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const pair = [players[i].steam_id, players[j].steam_id].sort().join('|');
          pairMap.set(pair, (pairMap.get(pair) || 0) + 1);
        }
      }
    });

    return Array.from(pairMap.entries())
      .map(([pair, count]) => {
        const [p1, p2] = pair.split('|');
        return {
          player1: p1,
          player1Name: this.getDisplayName(p1),
          player2: p2,
          player2Name: this.getDisplayName(p2),
          roundsTogether: count,
          winsTogether: 0,
          winRate: 0,
        };
      })
      .sort((a, b) => b.roundsTogether - a.roundsTogether);
  });

  constructor() {
    afterNextRender(() => {
      runInInjectionContext(this.injector, () => {
        effect(() => {
          const rounds = this.rounds();
          if (rounds.length > 0) {
            setTimeout(() => this.initCharts(), 100);
            const missingIds = Array.from(
              new Set(rounds.flatMap((r) => r.players.map((p) => p.steam_id))),
            ).filter((id) => id && !this.steamIdDisplayNames[id]);
            console.log('Missing Steam IDs:', missingIds);
          }
        });
      });
    });
  }

  private initCharts(): void {
    // Destroy existing charts
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];

    this.createWeaponsChart();
    this.createRolesChart();
    this.createMapsChart();
  }

  private createWeaponsChart(): void {
    const canvas = this.weaponsChartCanvas()?.nativeElement;
    if (!canvas) return;

    const topWeapons = this.weaponStats().slice(0, 8);
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: topWeapons.map((w) => w.weapon),
        datasets: [
          {
            label: 'Kills',
            data: topWeapons.map((w) => w.kills),
            backgroundColor: '#f87171',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#9090a0', maxRotation: 45 },
          },
          y: {
            grid: { color: '#2a2a3a' },
            ticks: { color: '#e4e4eb' },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
    this.charts.push(chart);
  }

  private createRolesChart(): void {
    const canvas = this.rolesChartCanvas()?.nativeElement;
    if (!canvas) return;

    const roles = this.roleDistribution().slice(0, 10);
    const roleColors: Record<string, string> = {
      innocent: '#4ade80',
      traitor: '#f87171',
      detective: '#60a5fa',
      jester: '#fbbf24',
      hypnotist: '#f472b6',
      glitch: '#34d399',
      phantom: '#a78bfa',
      killer: '#ef4444',
      drunk: '#fcd34d',
      clown: '#fb923c',
      jackal: '#0cbaba',
      sidekick: '#0b9e9e',
    };

    const chart = new Chart(canvas, {
      type: 'polarArea',
      data: {
        labels: roles.map((r) => r.role.charAt(0).toUpperCase() + r.role.slice(1)),
        datasets: [
          {
            data: roles.map((r) => r.count),
            backgroundColor: roles.map((r) => roleColors[r.role] || '#94a3b8'),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#e4e4eb', padding: 10 },
          },
        },
        scales: {
          r: {
            grid: { color: '#2a2a3a' },
            ticks: { display: false },
          },
        },
      },
    });
    this.charts.push(chart);
  }

  private createMapsChart(): void {
    const canvas = this.mapsChartCanvas()?.nativeElement;
    if (!canvas) return;

    const maps = this.mapStats().slice(0, 6);
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: maps.map((m) => m.mapName),
        datasets: [
          {
            label: 'Innocent Siege',
            data: maps.map((m) => m.innocentWins),
            backgroundColor: '#4ade80',
            borderRadius: 4,
          },
          {
            label: 'Traitor Siege',
            data: maps.map((m) => m.traitorWins),
            backgroundColor: '#f87171',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#9090a0' },
            stacked: true,
          },
          y: {
            grid: { color: '#2a2a3a' },
            ticks: { color: '#e4e4eb' },
            stacked: true,
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#e4e4eb' },
          },
        },
      },
    });
    this.charts.push(chart);
  }

  private isInnocentRole(role: string | null): boolean {
    if (!role) return false;
    const normalized = role.toLowerCase();
    return ['innocent', 'detective', 'deputy', 'mercenary', 'glitch', 'phantom'].includes(
      normalized,
    );
  }

  private isTraitorRole(role: string | null): boolean {
    if (!role) return false;
    const normalized = role.toLowerCase();
    return [
      'traitor',
      'hypnotist',
      'impersonator',
      'assassin',
      'vampire',
      'zombie',
      'detraitor',
    ].includes(normalized);
  }

  private isTeamkill(attackerRole: string | null, victimRole: string | null): boolean {
    if (!attackerRole || !victimRole) return false;
    const attackerInnocent = this.isInnocentRole(attackerRole);
    const attackerTraitor = this.isTraitorRole(attackerRole);
    const victimInnocent = this.isInnocentRole(victimRole);
    const victimTraitor = this.isTraitorRole(victimRole);

    return (attackerInnocent && victimInnocent) || (attackerTraitor && victimTraitor);
  }

  private playerWon(winningTeam: string | undefined, role: string | null): boolean {
    if (!winningTeam || !role) return false;
    const team = winningTeam.toLowerCase();
    const r = role.toLowerCase();

    if (team === 'innocents' && this.isInnocentRole(r)) return true;
    if (team === 'traitors' && this.isTraitorRole(r)) return true;
    if ((team === 'jackal' || team === 'jackals') && ['jackal', 'sidekick'].includes(r))
      return true;
    if (team === 'jester' && ['jester', 'swapper', 'clown', 'beggar'].includes(r)) return true;
    if (team === r) return true; // e.g. winner === 'killer' and role === 'killer'

    return false;
  }

  getDisplayName(steamId: string | null): string {
    if (!steamId) return 'Welt';
    return this.steamIdDisplayNames[steamId] ?? steamId.replace('STEAM_', 'S:');
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getRoleClass(role: string | null): string {
    if (!role) return 'role-unknown';
    const normalized = role.toLowerCase();

    // Detective gets its own color (dark blue)
    if (normalized === 'detective') return 'role-detective';
    if (this.isInnocentRole(role)) return 'role-innocent';
    if (this.isTraitorRole(role)) return 'role-traitor';
    if (['jester', 'swapper', 'clown', 'beggar'].includes(normalized)) return 'role-jester';
    if (['jackal'].includes(normalized)) return 'role-jackal';
    if (['sidekick'].includes(normalized)) return 'role-sidekick';
    if (['killer', 'oldman', 'drunk', 'revenger'].includes(normalized)) return 'role-independent';
    return 'role-unknown';
  }

  refresh(): void {
    this.roundsResource.reload();
  }

  // ========== FILTER METHODS ==========
  onDateFromChange(value: string): void {
    this.dateFrom.set(value || null);
    this.selectedSession.set(null);
  }

  onDateToChange(value: string): void {
    this.dateTo.set(value || null);
    this.selectedSession.set(null);
  }

  selectSession(label: string | null): void {
    this.selectedSession.set(label);
    if (!label) {
      this.dateFrom.set(null);
      this.dateTo.set(null);
      return;
    }
    const session = this.sessions().find((s) => s.label === label);
    if (session) {
      // Set date range to session bounds
      const startDate = new Date(session.startISO);
      const endDate = new Date(session.endISO);
      // Format as YYYY-MM-DD for date inputs
      this.dateFrom.set(this.formatDateInput(startDate));
      this.dateTo.set(this.formatDateInput(endDate));
    }
  }

  clearFilters(): void {
    this.dateFrom.set(null);
    this.dateTo.set(null);
    this.selectedSession.set(null);
  }

  private formatDateInput(date: Date): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
