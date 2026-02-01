const { spawn } = require('child_process');

function runFfmpegSilently(args, callback) {
    const ffmpeg = spawn('ffmpeg', args, {
        stdio: 'ignore',
        windowsHide: true
    });

    ffmpeg.on('error', (error) => {
        console.error(error);
        callback(error);
    });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            callback(null);
        } else {
            callback(new Error(code));
        }
    });
}

function convertGifToMp4(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        runFfmpegSilently(['-i', inputPath, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', outputPath], (error) => {
            if (error) return reject(error);
            resolve(outputPath);
        });
    });
}

module.exports = {
    runFfmpegSilently
};
