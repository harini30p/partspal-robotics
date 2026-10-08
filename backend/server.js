const express = require('express');
const cors = require('cors');
require('./database');
const partsRouter = require('./routes/parts');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'PartsPal API is running'
  });
});

app.use('/api/parts', partsRouter);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;

