/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_RECOGNITION_STAGE?: string
    readonly VITE_PLATFORM_SDK_STAGE?: string
    readonly VITE_GAME_ID?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
