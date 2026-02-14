import { StringBinaryMessageManager } from "./StringBinaryMessageManager.js";

export async function doNetworkSimulationDemo() {
    console.log("Starting network simulation demo...");
    const manager = new StringBinaryMessageManager();
    const messages = ["Hello, World!", "BinaryMessageManager", "TypeScript"];

    // Create bidirectional "pipes" to simulate network
    const { readable: serverReceives, writable: clientSends } = new TransformStream<Uint8Array>();
    const { readable: clientReceives, writable: serverSends } = new TransformStream<Uint8Array>();

    // Run client and server concurrently with Promise.all
    const [clientResult, serverResult] = await Promise.all([
        // Client: send messages, then read responses
        (async () => {
            console.log("Client: Sending messages...");
            await manager.pipeMessagesToStream(messages, clientSends);
            console.log("Client: Done sending, waiting for responses...");

            const responses: string[] = [];
            for await (const msg of manager.deframeFromReadableStream(clientReceives)) {
                console.log("Client received:", msg);
                responses.push(msg);
            }
            return responses;
        })(),

        // Server: read messages, then send responses
        (async () => {
            console.log("Server: Waiting for messages...");
            const received: string[] = [];
            for await (const msg of manager.deframeFromReadableStream(serverReceives)) {
                console.log("Server received:", msg);
                received.push(msg);
            }

            console.log("Server: Sending responses...");
            const responses = received.map(m => `Echo: ${m}`);
            await manager.pipeMessagesToStream(responses, serverSends);
            console.log("Server: Done sending responses");
            return received;
        })()
    ]);

    console.log("Client got responses:", clientResult);
    console.log("Server received:", serverResult);

    console.log("Network simulation demo complete.\n");
}