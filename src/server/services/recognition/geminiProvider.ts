import { GoogleGenAI } from '@google/genai';
import { RecognitionProvider, RecognitionResult, DetectedGame } from './types.ts';

export class GeminiRecognitionProvider implements RecognitionProvider {
  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_KEY_MISSING');
    }

    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async recognizeScoresheet(imageBuffer: Buffer, mimeType: string): Promise<RecognitionResult> {
    const ai = this.getClient();
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

    const base64Image = imageBuffer.toString('base64');

    const prompt = `You are a professional vision AI system specializing in parsing paper scoresheets (blanks) from competitive Mafia club tournaments.
Analyze the image carefully. One photograph MAY contain one OR multiple filled game protocols side-by-side or stacked.

Do NOT guess unreadable values. If a field is blank, unclear, or unreadable, set value to null and confidence < 0.6.
Decimal numbers written with commas like "0,2" MUST be returned as numbers with dots: 0.2.

For EACH game protocol found on the photo, extract:
1. game_number (integer or null) and game_number_confidence.
2. winner_team: value ("red", "black", or null) and confidence.
3. players: Array of exactly 10 players for seats 1 to 10. For each seat 1..10:
   - seat_number (1..10)
   - written_name (string or null - hand-written nickname on blank)
   - role: value ("citizen", "sheriff", "mafia", "don", or null) and confidence
   - regular_fouls: value (number, e.g. 0,1,2,3,4) and confidence
   - technical_fouls: value (number) and confidence
   - judge_bonus: value (number, e.g. 0.2, 0.4, or -0.3 for judge minus/penalty) and confidence
   - protocol_bonus: value (number) and confidence
   - penalty_points: value (0) and confidence 1.0
4. best_move (ЛХ / Лучший ход):
   - recipient_seat: seat number of first-night killed player who wrote best move (or null)
   - seat_numbers: array of up to 3 guessed mafia seat numbers (1..10)
   - confidence (0..1)
5. shots (ночные выстрелы):
   - night_number (1..N)
   - seat_number (target seat 1..10 or null)
   - result ("killed", "miss", "agreement_failed", or null)
   - confidence (0..1)
6. votes (голосования по раундам):
   - round_number (1..N)
   - is_revote (boolean)
   - entries: list of { candidate_seat: number (1..10), votes_count: number }
   - confidence (0..1)
7. color_protocols (заметки цветов игроками / шерифом):
   - owner_seat: seat number (1..10)
   - entries: list of { seat_numbers: number[], mark: "red" | "black" | "sheriff" }
   - confidence (0..1)
8. judge_name: value (handwritten judge name or null) and confidence.
9. warnings: array of warning strings if anything is questionable or damaged.

Return ONLY a JSON object with schema:
{
  "detected_games": [
    ...
  ]
}`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType || 'image/jpeg',
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text || '';
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      // Fallback parsing if wrapped in markdown block
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse JSON response from Gemini model');
      }
    }

    return this.sanitizeResult(parsed);
  }

  private sanitizeResult(parsed: any): RecognitionResult {
    const rawGames = Array.isArray(parsed?.detected_games) ? parsed.detected_games : [];
    const detected_games: DetectedGame[] = rawGames.map((g: any, idx: number) => {
      const gameNumber = typeof g.game_number === 'number' ? g.game_number : null;
      const gameConf = typeof g.game_number_confidence === 'number' ? g.game_number_confidence : 0.5;

      const rawWinner = g.winner_team?.value || null;
      const winnerVal = ['red', 'black'].includes(rawWinner) ? rawWinner : null;
      const winnerConf = typeof g.winner_team?.confidence === 'number' ? g.winner_team.confidence : 0;

      // Ensure 10 seats
      const rawPlayers = Array.isArray(g.players) ? g.players : [];
      const players = Array.from({ length: 10 }, (_, seatIdx) => {
        const seatNum = seatIdx + 1;
        const rawP = rawPlayers.find((p: any) => Number(p.seat_number) === seatNum) || {};

        const rawRole = rawP.role?.value || null;
        const roleVal = ['citizen', 'sheriff', 'mafia', 'don'].includes(rawRole) ? rawRole : null;
        const roleConf = typeof rawP.role?.confidence === 'number' ? rawP.role.confidence : 0;

        const parseNum = (field: any, defaultVal = 0) => {
          let v = field?.value;
          if (typeof v === 'string') {
            v = parseFloat(v.replace(',', '.'));
          }
          const num = typeof v === 'number' && !isNaN(v) ? v : defaultVal;
          const conf = typeof field?.confidence === 'number' ? field.confidence : 0.5;
          return { value: num, confidence: conf };
        };

        const jb = parseNum(rawP.judge_bonus, 0);
        const pp = parseNum(rawP.penalty_points, 0);
        if (pp.value > 0 && jb.value === 0) {
          jb.value = -Math.abs(pp.value);
          pp.value = 0;
        } else if (pp.value > 0) {
          pp.value = 0;
        }

        return {
          seat_number: seatNum,
          written_name: rawP.written_name || null,
          role: { value: roleVal, confidence: roleConf },
          regular_fouls: parseNum(rawP.regular_fouls, 0),
          technical_fouls: parseNum(rawP.technical_fouls, 0),
          judge_bonus: jb,
          protocol_bonus: parseNum(rawP.protocol_bonus, 0),
          penalty_points: pp,
        };
      });

      // Best move
      let best_move = null;
      if (g.best_move) {
        const recip = typeof g.best_move.recipient_seat === 'number' ? g.best_move.recipient_seat : null;
        const seats = Array.isArray(g.best_move.seat_numbers)
          ? g.best_move.seat_numbers.map((n: any) => Number(n)).filter((n: number) => n >= 1 && n <= 10)
          : [];
        const conf = typeof g.best_move.confidence === 'number' ? g.best_move.confidence : 0.5;
        best_move = { recipient_seat: recip, seat_numbers: seats, confidence: conf };
      }

      // Shots
      const shots = Array.isArray(g.shots)
        ? g.shots.map((s: any) => {
            const rawRes = s.result;
            const res = ['killed', 'miss', 'agreement_failed'].includes(rawRes) ? rawRes : null;
            return {
              night_number: Number(s.night_number) || 1,
              seat_number: typeof s.seat_number === 'number' ? s.seat_number : null,
              result: res,
              confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
            };
          })
        : [];

      // Votes
      const votes = Array.isArray(g.votes)
        ? g.votes.map((v: any) => ({
            round_number: Number(v.round_number) || 1,
            is_revote: Boolean(v.is_revote),
            entries: Array.isArray(v.entries)
              ? v.entries.map((e: any) => ({
                  candidate_seat: Number(e.candidate_seat) || 1,
                  votes_count: Number(e.votes_count) || 0,
                }))
              : [],
            confidence: typeof v.confidence === 'number' ? v.confidence : 0.5,
          }))
        : [];

      // Color protocols
      const color_protocols = Array.isArray(g.color_protocols)
        ? g.color_protocols.map((cp: any) => ({
            owner_seat: Number(cp.owner_seat) || 1,
            entries: Array.isArray(cp.entries)
              ? cp.entries.map((e: any) => ({
                  seat_numbers: Array.isArray(e.seat_numbers) ? e.seat_numbers.map((n: any) => Number(n)) : [],
                  mark: ['red', 'black', 'sheriff'].includes(e.mark) ? e.mark : 'red',
                }))
              : [],
            confidence: typeof cp.confidence === 'number' ? cp.confidence : 0.5,
          }))
        : [];

      const judge_name = {
        value: g.judge_name?.value || null,
        confidence: typeof g.judge_name?.confidence === 'number' ? g.judge_name.confidence : 0,
      };

      const warnings = Array.isArray(g.warnings) ? g.warnings : [];

      return {
        game_number: gameNumber || idx + 1,
        game_number_confidence: gameConf,
        winner_team: { value: winnerVal, confidence: winnerConf },
        players,
        best_move,
        shots,
        votes,
        color_protocols,
        judge_name,
        warnings,
      };
    });

    return { detected_games };
  }
}
