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
    return `${truncatedValue}X`;
}
