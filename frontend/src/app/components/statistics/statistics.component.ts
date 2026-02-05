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
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { Round } from '../../models/stats.model';
import { environment } from '../../../environments/environment';
import { Chart, registerables } from 'chart.js';

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
  imports: [CommonModule, RouterLink],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
})
export class StatisticsComponent {
  private readonly apiUrl = environment.apiUrl;
  private readonly injector = inject(Injector);

  // Chart refs
  winRateChartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('winRateChart');
  killsChartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('killsChart');
  weaponsChartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('weaponsChart');
  activityChartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('activityChart');
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

  // Computed statistics
  rounds = computed(() => this.roundsResource.value() ?? []);
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

        // Karma and points
        if (player.karma_diff !== null) stats.karmaTotal += player.karma_diff;
        if (player.points_diff !== null) stats.pointsTotal += player.points_diff;

        // Check if player won this round
        const isInnocent = this.isInnocentRole(player.role_start);
        const isTraitor = this.isTraitorRole(player.role_start);

        if (winningTeam === 'innocents' && isInnocent) {
          stats.winsAsInnocent++;
          stats.totalWins++;
        } else if (winningTeam === 'traitors' && isTraitor) {
          stats.winsAsTraitor++;
          stats.totalWins++;
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

  // Activity by day of week
  activityByDay = computed(() => {
    const rounds = this.rounds();
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const counts = new Array(7).fill(0);

    rounds.forEach((round) => {
      const date = new Date(round.timestamp);
      counts[date.getDay()]++;
    });

    return days.map((day, index) => ({ day, count: counts[index] }));
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

  // Win statistics
  winStats = computed(() => {
    const rounds = this.rounds();
    const innocent = rounds.filter((r) => r.winner?.toLowerCase() === 'innocents').length;
    const traitor = rounds.filter((r) => r.winner?.toLowerCase() === 'traitors').length;
    const other = rounds.length - innocent - traitor;
    return { innocent, traitor, other };
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
          }
        });
      });
    });
  }

  private initCharts(): void {
    // Destroy existing charts
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];

    this.createWinRateChart();
    this.createKillsChart();
    this.createWeaponsChart();
    this.createActivityChart();
    this.createRolesChart();
    this.createMapsChart();
  }

  private createWinRateChart(): void {
    const canvas = this.winRateChartCanvas()?.nativeElement;
    if (!canvas) return;

    const stats = this.winStats();
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Innocents', 'Traitors', 'Andere'],
        datasets: [
          {
            data: [stats.innocent, stats.traitor, stats.other],
            backgroundColor: ['#4ade80', '#f87171', '#94a3b8'],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#e4e4eb', padding: 20 },
          },
        },
      },
    });
    this.charts.push(chart);
  }

  private createKillsChart(): void {
    const canvas = this.killsChartCanvas()?.nativeElement;
    if (!canvas) return;

    const topPlayers = this.topKillers();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: topPlayers.map((p) => p.displayName),
        datasets: [
          {
            label: 'Kills/Runde',
            data: topPlayers.map((p) => p.killsPerRound),
            backgroundColor: '#6366f1',
            borderRadius: 4,
          },
          {
            label: 'K/D',
            data: topPlayers.map((p) => p.kd),
            backgroundColor: '#a855f7',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: {
            grid: { color: '#2a2a3a' },
            ticks: { color: '#9090a0' },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#e4e4eb' },
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

  private createActivityChart(): void {
    const canvas = this.activityChartCanvas()?.nativeElement;
    if (!canvas) return;

    const activity = this.activityByDay();
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: activity.map((a) => a.day),
        datasets: [
          {
            label: 'Runden',
            data: activity.map((a) => a.count),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#6366f1',
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
          },
          y: {
            grid: { color: '#2a2a3a' },
            ticks: { color: '#e4e4eb' },
            beginAtZero: true,
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

  getDisplayName(steamId: string | null): string {
    if (!steamId) return 'Welt';
    return steamId;
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getRoleClass(role: string | null): string {
    if (!role) return 'role-unknown';
    const normalized = role.toLowerCase();

    if (this.isInnocentRole(role)) return 'role-innocent';
    if (this.isTraitorRole(role)) return 'role-traitor';
    if (['jester', 'swapper', 'clown', 'beggar'].includes(normalized)) return 'role-jester';
    if (['killer', 'oldman', 'drunk', 'revenger'].includes(normalized)) return 'role-independent';
    return 'role-unknown';
  }

  refresh(): void {
    this.roundsResource.reload();
  }
}
