const fetch = require('node-fetch');

const tpdne = async () => {
    try {
        console.log('Get image from thispersondoesnotexist.com...');
        const response = await fetch('https://thispersondoesnotexist.com');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const buffer = await response.buffer();
        const base64Image = buffer.toString('base64');
        return `data:image/jpeg;base64,${base64Image}`;
    } catch (error) {
        console.error('Error fetching image from thispersondoesnotexist.com:', error);
    }
};

module.exports = {
    tpdne
};
