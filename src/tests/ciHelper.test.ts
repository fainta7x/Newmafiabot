import { describe, it, expect } from 'vitest';
import {
  calculateCiThreshold,
  calculateCiRate,
  calculateGameCi
} from '../server/utils/ciHelper.ts';

describe('ciHelper unit tests', () => {
  describe('calculateCiThreshold', () => {
    it('should return correct thresholds based on distanceGames', () => {
      expect(calculateCiThreshold(10)).toBe(4);
      expect(calculateCiThreshold(5)).toBe(2);
      expect(calculateCiThreshold(0)).toBe(0);
      expect(calculateCiThreshold(12)).toBe(5);
    });
  });

  describe('calculateCiRate', () => {
    it('should calculate FSM 2022 rate correctly', () => {
      expect(calculateCiRate(0, 4)).toBe(0);
      expect(calculateCiRate(1, 4)).toBe(0.1);
      expect(calculateCiRate(2, 4)).toBe(0.2);
      expect(calculateCiRate(3, 4)).toBe(0.3);
      expect(calculateCiRate(4, 4)).toBe(0.4);
      expect(calculateCiRate(5, 4)).toBe(0.4);
      expect(calculateCiRate(10, 4)).toBe(0.4);
      expect(calculateCiRate(1, 0)).toBe(0);
    });
  });

  describe('calculateGameCi', () => {
    it('should return 0 for alive participants', () => {
      expect(calculateGameCi({
        isFirstKilled: false,
        role: 'citizen',
        winnerTeam: 'red',
        bestMoveParticipantId: null,
        participantId: 'p1',
        hasBlackInBestMove: false,
        playerRate: 0.4
      }).gameCi).toBe(0);
    });

    it('should return 0 for mafia role', () => {
      expect(calculateGameCi({
        isFirstKilled: true,
        role: 'mafia',
        winnerTeam: 'red',
        bestMoveParticipantId: null,
        participantId: 'p1',
        hasBlackInBestMove: false,
        playerRate: 0.4
      }).gameCi).toBe(0);
    });

    it('should return full rate for red citizen loss first killed', () => {
      expect(calculateGameCi({
        isFirstKilled: true,
        role: 'citizen',
        winnerTeam: 'black',
        bestMoveParticipantId: null,
        participantId: 'p1',
        hasBlackInBestMove: false,
        playerRate: 0.4
      })).toEqual({
        gameCi: 0.4,
        ciReason: 'red_loss_full'
      });
    });

    it('should return half rate for red citizen win with best move and black in LHS', () => {
      expect(calculateGameCi({
        isFirstKilled: true,
        role: 'citizen',
        winnerTeam: 'red',
        bestMoveParticipantId: 'p1',
        participantId: 'p1',
        hasBlackInBestMove: true,
        playerRate: 0.4
      })).toEqual({
        gameCi: 0.2,
        ciReason: 'red_win_half_with_black_lh'
      });
    });

    it('should return 0 for red citizen win without black in LHS', () => {
      expect(calculateGameCi({
        isFirstKilled: true,
        role: 'citizen',
        winnerTeam: 'red',
        bestMoveParticipantId: 'p1',
        participantId: 'p1',
        hasBlackInBestMove: false,
        playerRate: 0.4
      }).gameCi).toBe(0);
    });
  });
});
