
const fs = require('fs')
const { unlink } = require('fs').promises
const axios = require('axios')
const child_process = require('child_process')
const sleep = (ms) => {
        return new Promise((resolve) => { setTimeout(resolve, ms) })

}


export function fetchJson(url, options) {
        try {
                options ? options : {}
                const res = axios({
                        method: 'GET',
                        url: url,
                        headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
                        },
                        ...options
                })
                return res.data
        } catch (err) {
                return err
        }
}
export function GIFBufferToVideoBuffer(image) {

        const filename = `${Math.random().toString(36)}`
        fs.writeFileSync(`./Processes/${filename}.gif`, image)
        child_process.exec(
                `ffmpeg -i ./Processes/${filename}.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" ./Processes/${filename}.mp4`
        )
        sleep(4000)

        var buffer5 = fs.readFileSync(`./Processes/${filename}.mp4`)
        Promise.all([unlink(`./Processes/${filename}.mp4`), unlink(`./Processes/${filename}.gif`)])
        return buffer5
} 