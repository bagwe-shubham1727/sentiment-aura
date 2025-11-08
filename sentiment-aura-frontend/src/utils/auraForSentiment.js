//auraHelperFuntion
export function auraForSentiment(sRaw) {
    const s = Math.max(0, Math.min(1, Number(sRaw) || 0));

    // Keep mapping in the same buckets the canvas uses.
    if (s <= 0.01) {
        return {
            label: "White",
            color: "#ffffff",
            meaning: "Calm / no strong energy",
            textColor: "#000",
        };
    }
    if (s <= 0.12) {
        return {
            label: "Red",
            color: "hsl(0,75%,35%)",
            meaning: "Energetic, passionate, fiery",
            textColor: "#fff",
        };
    }
    if (s <= 0.24) {
        return {
            label: "Orange",
            color: "hsl(25,100%,50%)",
            meaning: "Creative, optimistic, action-oriented",
            textColor: "#000",
        };
    }
    if (s <= 0.38) {
        return {
            label: "Yellow",
            color: "hsl(50,100%,60%)",
            meaning: "Joyful, active, optimistic",
            textColor: "#000",
        };
    }
    if (s <= 0.53) {
        return {
            label: "Green",
            color: "hsl(120,80%,35%)",
            meaning: "Loving, compassionate, nurturing",
            textColor: "#fff",
        };
    }
    if (s <= 0.66) {
        return {
            label: "Blue",
            color: "hsl(200,80%,40%)",
            meaning: "Calm, perceptive, peaceful",
            textColor: "#fff",
        };
    }
    if (s <= 0.76) {
        return {
            label: "Indigo",
            color: "hsl(230,90%,35%)",
            meaning: "Sensitive, intuitive, empathic",
            textColor: "#fff",
        };
    }
    if (s <= 0.86) {
        return {
            label: "Purple/Pink",
            color: "hsl(290,80%,55%)",
            meaning: "Intuitive, loving, affectionate",
            textColor: "#fff",
        };
    }
    if (s <= 0.96) {
        return {
            label: "Pink/Light",
            color: "hsl(330,60%,88%)",
            meaning: "Near-pure, loving, radiant",
            textColor: "#000",
        };
    }
    // 0.96 < s <= 1.0
    return {
        label: "White / Rainbow",
        color: "#ffffff",
        meaning: "Pure, spiritually elevated / rainbow shimmer",
        textColor: "#000",
    };
}
