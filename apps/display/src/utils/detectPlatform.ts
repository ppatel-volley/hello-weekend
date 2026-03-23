export type TVPlatform = "WEB" | "FIRE_TV" | "SAMSUNG_TV" | "LG_TV" | "MOBILE"

export function detectPlatform(): TVPlatform {
    const params = new URLSearchParams(window.location.search)
    const override = params.get("volley_platform")
    if (override === "FIRE_TV") return "FIRE_TV"
    if (override === "SAMSUNG_TV") return "SAMSUNG_TV"
    if (override === "LG_TV") return "LG_TV"

    const ua = navigator.userAgent
    if (/Tizen.*SMART-TV/i.test(ua)) return "SAMSUNG_TV"
    if (/Web0S.*SmartTV/i.test(ua)) return "LG_TV"
    if (/AFT/i.test(ua)) return "FIRE_TV"

    return "WEB"
}

export function isTV(platform: TVPlatform): boolean {
    return ["FIRE_TV", "SAMSUNG_TV", "LG_TV"].includes(platform)
}
