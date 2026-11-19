# Opening Flash

Learn chess openings by name, by sight and by heart.

Two opening sets:
- **Popular**: 153 well-known openings and variations, with nicknames ("Caro Khan", "Philadelphia defense") and voice-friendly spellings.
- **Lichess**: all 3,865 named lines from the [Lichess chess-openings database](https://github.com/lichess-org/chess-openings) (public domain, CC0).

- **Flash → Name it**: a position flashes up, name the opening before the timer runs out (type it, or say it with browser voice or Whisper).
- **Flash → Rebuild it**: see the line for a few seconds, then play it from memory, both sides, exact move order.
- **Training → Study**: browse every opening and step through its moves.
- **Training → Rebuild**: look at a line as long as you like, press Ready, then play it from memory. Wrong moves snap back; Hint greys out the piece to move; Show move plays it for you.

No install, no build step: it's plain HTML, CSS and JavaScript. Open `index.html`, or host the folder anywhere (e.g. GitHub Pages).

Whisper voice answers run [Whisper tiny.en](https://huggingface.co/Xenova/whisper-tiny.en) in your browser with [transformers.js](https://github.com/huggingface/transformers.js) (about 40 MB, downloaded once).

## Credits
- Chess pieces: [Chessnut](https://github.com/LexLuengas/chessnut-pieces) by Alexis Luengas, Apache 2.0 (unmodified; licence in `img/pieces/`).
- Legal-move rules: [chess.js](https://github.com/jhlywa/chess.js) by Jeff Hlywa, BSD-2-Clause.
- Lichess opening set: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0.
