// src/services/deepgramRealtime.js
export default function createDeepgramRealtime({ getToken, debug = false } = {}) {
    if (!getToken) throw new Error("getToken is required");

    let ws = null;
    let audioContext = null;
    let audioInput = null;
    let processor = null;
    let stream = null;
    let onTranscriptCb = () => { };
    let onErrorCb = () => { };

    const log = (...args) => debug && console.log("[Deepgram]", ...args);

    function float32ToInt16(buffer) {
        const output = new Int16Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            const s = Math.max(-1, Math.min(1, buffer[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    }

    async function start() {
        const token = await getToken();
        const url = `wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=linear16&sample_rate=16000`;

        ws = new WebSocket(url, ["token", token]);
        ws.binaryType = "arraybuffer";

        ws.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                log("Received:", data);

                if (data?.type === "TurnInfo") {
                    const text = data.transcript || "";
                    const is_final = data.event === "EndOfTurn";

                    if (text) {
                        onTranscriptCb({ text, is_final });
                    }
                }
            } catch (e) {
                log("Parse error:", e);
            }
        };

        ws.onerror = (e) => onErrorCb(e);

        await new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = reject;
            setTimeout(() => reject(new Error("timeout")), 5000);
        });

        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext({ sampleRate: 16000 });
        audioInput = audioContext.createMediaStreamSource(stream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
            const float32 = e.inputBuffer.getChannelData(0);
            const int16 = float32ToInt16(float32);

            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(int16.buffer);
            }
        };

        audioInput.connect(processor);
        processor.connect(audioContext.destination);

        log("Started");
    }

    async function stop() {
        processor?.disconnect();
        audioInput?.disconnect();
        await audioContext?.close();
        stream?.getTracks().forEach(t => t.stop());
        ws?.close();

        processor = audioInput = audioContext = stream = ws = null;
        log("Stopped");
    }

    return {
        start,
        stop,
        onTranscript: (fn) => { onTranscriptCb = fn; },
        onError: (fn) => { onErrorCb = fn; },
    };
}