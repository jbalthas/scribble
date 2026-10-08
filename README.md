# Scribble Party

A skribbl.io-style drawing game where drawing quality is scored, not just guessing speed.

## Run

```powershell
npm install
npm start        # or: npm run dev (auto-restarts on server changes)
```

Open http://localhost:3000, create a room, and use **Copy invite** to share the link.

## Playing with friends

- **Same Wi-Fi:** friends open the `Network:` URL printed in the console (allow Node through Windows Firewall when prompted).
- **Over the internet:** expose port 3000 with a tunnel and open the game via the tunnel URL so invite links use it:
  ```powershell
  npx cloudflared tunnel --url http://localhost:3000
  ```

## Scoring

| Who | Points | Setting |
| --- | --- | --- |
| Guesser | linear from instant → last second | `Instant guess points` → `Last-second guess points` |
| Artist | weight × average guess speed (non-guessers count as 0) | `Speed points` |
| Artist | weight × share of players who guessed | `Players-guessed points` |
| Artist | flat, only if everyone guessed | `Everyone-guessed bonus` |

Artist max per turn = the three artist weights summed, regardless of player count.
Presets: **Guesser Focus**, **Balanced**, **Artist Spotlight** (default). The lobby bar shows the artist vs. guesser split.

Word choices run easy → hard. Medium and hard words multiply both guesser and artist points (`Medium/Hard word points %`, default 125% / 150%). Custom words count as medium.

**End-of-game voting** (lobby settings): players vote for the best and/or worst drawing (not their own). The top-voted artist gets `Best drawing points` added or `Worst drawing penalty` subtracted; set either to 0 for no points. If drawings tie, they all win.
