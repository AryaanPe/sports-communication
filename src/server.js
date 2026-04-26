const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the 'runs' folder so React can play the output videos
app.use('/output', express.static(path.join(__dirname, 'runs/detect')));

app.post('/run-inference', (req, res) => {
    const { videoPath, weights, conf } = req.body;

    // Use the absolute path to your python script
    const scriptPath = path.join(__dirname, 'test.py');
    
    // Construct arguments for test.py
    const args = [
        scriptPath, 
        videoPath, 
        '--weights', weights || 'best.pt', 
        '--conf', conf?.toString() || '0.25'
    ];

    console.log(`Executing: python ${args.join(' ')}`);
    const pythonProcess = spawn('python', args);

    pythonProcess.stdout.on('data', (data) => console.log(`Python: ${data}`));
    pythonProcess.stderr.on('data', (data) => console.error(`Error: ${data}`));

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            // Logic to find the newest file in runs/detect/predict (or similar)
            // For now, we return a success status
            res.status(200).json({ 
                message: "Inference complete",
                outputFolder: "/output" 
            });
        } else {
            res.status(500).json({ error: "Inference failed" });
        }
    });
});

app.listen(5000, () => console.log('Backend bridge running on http://localhost:5000'));