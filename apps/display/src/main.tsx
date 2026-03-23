import { createRoot } from "react-dom/client"
import { App } from "./App"

// Suppress DispatchTimeoutError — WGFServer does not send Socket.IO acks,
// so dispatchThunk/dispatchReducer always reject after 10s. The thunk DOES execute.
window.addEventListener("unhandledrejection", (e) => {
    if (e.reason?.name === "DispatchTimeoutError") e.preventDefault()
})

// NO StrictMode — it kills VGF's Socket.IO transport
createRoot(document.getElementById("root")!).render(<App />)
