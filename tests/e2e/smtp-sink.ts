// A minimal SMTP server for tests: accepts any login and keeps each message
// it receives, so a test can check what the app sent.
import net from "net";

export type SunkMessage = { from: string; to: string[]; data: string };

export async function smtpSink() {
  const messages: SunkMessage[] = [];
  const server = net.createServer((socket) => {
    let current: SunkMessage = { from: "", to: [], data: "" };
    let inData = false;
    let buffer = "";
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 sink ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      let i;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push(current);
            current = { from: "", to: [], data: "" };
            reply("250 OK queued");
          } else {
            current.data += (line.startsWith("..") ? line.slice(1) : line) + "\n";
          }
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") socket.write("250-sink\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n");
        else if (cmd === "HELO") reply("250 sink");
        else if (cmd === "AUTH") reply("235 Authenticated");
        else if (cmd === "MAIL") {
          current.from = line.slice(10).trim();
          reply("250 OK");
        } else if (cmd === "RCPT") {
          current.to.push(line.slice(8).trim());
          reply("250 OK");
        } else if (cmd === "DATA") {
          inData = true;
          reply("354 End with .");
        } else if (cmd === "QUIT") {
          reply("221 Bye");
          socket.end();
        } else reply("250 OK");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return { port, messages, close: () => new Promise<void>((r) => server.close(() => r())) };
}
