const server = Bun.serve({
  port: 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) {
        return undefined;
      }
    }
    return new Response("Welcome to Toshik Babe Engine!");
  },
  websocket: {
    message(ws, message) {
      ws.send(`Echo: ${message}`);
    },
    open(ws) {
      console.log("WebSocket connection opened");
    },
    close(ws) {
      console.log("WebSocket connection closed");
    },
  },
});

const bornMessages = [
  "Russian: Я родился!",
  "English: I was born!",
  "Chinese (Simplified): 我出生了!",
  "Spanish: ¡He nacido!",
  "Arabic: لقد ولدت!",
  "French: Je suis né !",
  "German: Ich bin geboren!",
  "Hindi: मेरा जन्म हुआ है!",
  "Bengali: আমি জন্মেছি!",
  "Portuguese: Eu nasci!",
  "Japanese: 生まれました！",
  "Korean: 태어났어요!",
  "Turkish: Doğdum!",
  "Italian: Sono nato!",
  "Vietnamese: Tôi đã chào đời!",
  "Hebrew: נולדתי!",
  "Dutch: Ik ben geboren!",
  "Polish: Urodziłem się!",
  "Thai: ฉันเกิดแล้ว!",
  "Latin: Natus sum!",
];

bornMessages.forEach((msg) => console.log(msg));

console.log(`Toshik Babe Engine running on http://localhost:${server.port}`);
