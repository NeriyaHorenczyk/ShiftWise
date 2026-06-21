import 'dotenv/config';
import validateEnv from './src/utils/validateEnv.js';
import app from './src/app.js';

validateEnv()

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ShiftWise server running on port ${PORT}`);
});