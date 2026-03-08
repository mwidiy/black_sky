const http = require('http');

const data = JSON.stringify({
    message: {
        chat: { id: 123456789 },
        text: "Tolong buka kantin dong"
    }
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/webhook/telegram',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`);
    res.on('data', d => {
        process.stdout.write(d);
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
