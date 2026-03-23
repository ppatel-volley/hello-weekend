export function getSessionIdFromUrl(): string | null {
    return new URLSearchParams(window.location.search).get("sessionId")
}

export function getVolleyAccount(): string | null {
    return new URLSearchParams(window.location.search).get("volley_account")
}
