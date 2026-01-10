/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                ipl: {
                    blue: '#004ba0',
                    gold: '#d4af37',
                    dark: '#1e1e1e',
                    csk: '#FDB913',
                    mi: '#004BA0',
                    rcb: '#2B2A29',
                    kkr: '#3A225D',
                    dc: '#00008B',
                    rr: '#EA1A85',
                    srh: '#FF822A',
                    pbks: '#ED1B24',
                    gt: '#1B2133',
                    lsg: '#0057E2'
                }
            }
        },
    },
    plugins: [],
}
