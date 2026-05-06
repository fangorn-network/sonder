interface Window {
    api: {
        spotifyApi: (options: {
            url: string
            method: string
            token: string
            body?: any
        }) => Promise<{ status: number; body: string }>
    }
}