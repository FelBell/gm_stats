import { Component, signal, computed, linkedSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { Round, Kill, RoundPlayer, RoundBuy, HealthResponse } from '../../models/stats.model';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly apiUrl = environment.apiUrl;

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
  };

  // Pagination signals
  currentPage = signal(0);
  pageSize = 20;

  // HTTP Resources
  healthResource = httpResource<HealthResponse>(() => `${this.apiUrl}/health`);

  roundsResource = httpResource<Round[]>(
    () =>
      `${this.apiUrl}/stats?limit=${this.pageSize}&offset=${this.currentPage() * this.pageSize}`,
    { defaultValue: [] },
  );

  // Accumulated rounds - linkedSignal derives from resource but accumulates on page change
  private accumulatedRounds = linkedSignal<Round[], Round[]>({
    source: this.roundsResource.value,
    computation: (newRounds, previous) => {
      if (!newRounds || newRounds.length === 0) return previous?.value ?? [];
      if (this.currentPage() === 0) return newRounds;

      const existing = previous?.value ?? [];
      const existingIds = new Set(existing.map((r) => r.id));
      const uniqueNew = newRounds.filter((r) => !existingIds.has(r.id));
      return uniqueNew.length > 0 ? [...existing, ...uniqueNew] : existing;
    },
  });

  // Selected round for detail modal
  selectedRound = signal<Round | null>(null);

  // Computed values
  rounds = computed(() => this.accumulatedRounds());
  loading = computed(() => this.roundsResource.isLoading());
  error = computed(() =>
    this.roundsResource.error()
      ? 'Fehler beim Laden der Statistiken. Bitte später erneut versuchen.'
      : null,
  );
  apiHealthy = computed(() => {
    if (this.healthResource.isLoading()) return null;
    if (this.healthResource.error()) return false;
    return this.healthResource.value()?.status === 'ok';
  });
  hasMore = computed(() => {
    const lastFetch = this.roundsResource.value();
    return lastFetch ? lastFetch.length === this.pageSize : true;
  });

  // Computed statistics
  totalRounds = computed(() => this.rounds().length);
  totalKills = computed(() => this.rounds().reduce((sum, r) => sum + r.kills.length, 0));
  totalHeadshots = computed(() =>
    this.rounds().reduce((sum, r) => sum + r.kills.filter((k) => k.headshot).length, 0),
  );
  headshotRate = computed(() => {
    const kills = this.totalKills();
    return kills > 0 ? ((this.totalHeadshots() / kills) * 100).toFixed(1) : '0';
  });

  // Winner statistics
  winStats = computed(() => {
    const rounds = this.rounds();
    const innocent = rounds.filter((r) => r.winner === 'innocents').length;
    const traitor = rounds.filter((r) => r.winner === 'traitors').length;
    const other = rounds.length - innocent - traitor;
    return { innocent, traitor, other };
  });

  loadMore(): void {
    this.currentPage.update((p) => p + 1);
  }

  refresh(): void {
    this.currentPage.set(0);
    this.accumulatedRounds.set([]);
    this.roundsResource.reload();
    this.healthResource.reload();
  }

  selectRound(round: Round): void {
    this.selectedRound.set(round);
  }

  closeDetail(): void {
    this.selectedRound.set(null);
  }

  getRoleClass(role: string | null): string {
    if (!role) return 'role-unknown';
    const normalized = role.toLowerCase();

    // Innocent team
    if (
      ['innocent', 'detective', 'deputy', 'mercenary', 'glitch', 'phantom'].includes(normalized)
    ) {
      return 'role-innocent';
    }
    // Traitor team
    if (
      [
        'traitor',
        'hypnotist',
        'impersonator',
        'assassin',
        'vampire',
        'zombie',
        'detraitor',
      ].includes(normalized)
    ) {
      return 'role-traitor';
    }
    // Jester team / Neutral
    if (['jester', 'swapper', 'clown', 'beggar'].includes(normalized)) {
      return 'role-jester';
    }
    // Independent
    if (['killer', 'oldman', 'drunk', 'revenger'].includes(normalized)) {
      return 'role-independent';
    }
    return 'role-unknown';
  }

  getWinnerClass(winner: string): string {
    switch (winner?.toLowerCase()) {
      case 'innocents':
        return 'winner-innocent';
      case 'traitors':
        return 'winner-traitor';
      case 'timelimit':
        return 'winner-timelimit';
      default:
        return 'winner-other';
    }
  }

  getWinnerLabel(winner: string): string {
    switch (winner?.toLowerCase()) {
      case 'innocents':
        return 'Innocents';
      case 'traitors':
        return 'Traitors';
      case 'timelimit':
        return 'Zeit abgelaufen';
      default:
        return winner || 'Unbekannt';
    }
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatSteamId(steamId: string | null): string {
    if (!steamId) return 'Welt';
    // Check if we have a display name for this Steam ID
    if (this.steamIdDisplayNames[steamId]) {
      return this.steamIdDisplayNames[steamId];
    }
    // Shorten for display
    return steamId.replace('STEAM_', 'S:');
  }

  getDisplayName(steamId: string | null): string {
    if (!steamId) return 'Welt';
    return this.steamIdDisplayNames[steamId] ?? steamId.replace('STEAM_', 'S:');
  }

  trackByRoundId(index: number, round: Round): string {
    return round.id;
  }

  trackByKillIndex(index: number, kill: Kill): number {
    return index;
  }

  trackByPlayerSteamId(index: number, player: RoundPlayer): string {
    return player.steam_id;
  }

  trackByBuyIndex(index: number, buy: RoundBuy): number {
    return index;
  }
}
