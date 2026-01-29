import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Round, HealthResponse } from '../models/stats.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class StatsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /**
   * Check if the API is healthy
   */
  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.apiUrl}/health`);
  }

  /**
   * Get rounds with optional pagination
   */
  getRounds(limit: number = 20, offset: number = 0): Observable<Round[]> {
    return this.http.get<Round[]>(`${this.apiUrl}/stats`, {
      params: { limit: limit.toString(), offset: offset.toString() },
    });
  }
}
