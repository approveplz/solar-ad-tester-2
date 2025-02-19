export function formatCurrency(value) {
    if (value == null) return '-';
    return `$${Number(value).toLocaleString()}`;
}

export function truncateToTwoDecimals(value) {
    if (value == null) return '-';
    return Math.trunc(value * 100) / 100;
}

export function formatROI(value) {
    if (value == null) return '-';
    const truncatedValue = truncateToTwoDecimals(value);
    return `${truncatedValue}x`;
}

export function getCosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

    return dotProduct / (normA * normB);
}
