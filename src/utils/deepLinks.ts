const KAPSELY_WEB_BASE_URL = 'https://kapsely.com';

export const buildCapsuleShareUrl = (capsuleId: string) =>
    `${KAPSELY_WEB_BASE_URL}/capsules/${encodeURIComponent(capsuleId)}`;

export const buildCapsuleAppUrl = (capsuleId: string) =>
    `kapsely://capsules/${encodeURIComponent(capsuleId)}`;
