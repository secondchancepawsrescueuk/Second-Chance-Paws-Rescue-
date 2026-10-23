import express from 'express';
import pkg from 'pg';
import dotenv from 'dotenv';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));

// Init DB
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dogs (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      age VARCHAR(50),
      breed VARCHAR(100),
      gender VARCHAR(20),
      size VARCHAR(20),
      fee INTEGER,
      deposit INTEGER DEFAULT 200,
      description TEXT,
      image_url TEXT,
      status VARCHAR(20) DEFAULT 'Available',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      dog_id INTEGER REFERENCES dogs(id),
      name VARCHAR(100),
      email VARCHAR(100),
      phone VARCHAR(50),
      address TEXT,
      experience TEXT,
      home_type VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email VARCHAR(100) UNIQUE,
      password VARCHAR(200)
    );
  `);
  
  // Create admin
  const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'rescue2026@xxN', 10);
  await pool.query(`INSERT INTO admins (email, password) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING`, [process.env.ADMIN_EMAIL, hashed]);

  // Seed dogs if empty - with £400-£550 fees
  const count = await pool.query(`SELECT COUNT(*) FROM dogs`);
  if (parseInt(count.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO dogs (name, age, breed, gender, size, fee, deposit, description, image_url) VALUES
      ('Bella', '2 years', 'Labrador Mix', 'Female', 'Medium', 450, 200, 'Friendly and loves kids. Vaccinated, neutered, microchipped.', 'https://images.unsplash.com/photo-1552053831-71594a27632d?w=500'),
      ('Max', '3 years', 'German Shepherd', 'Male', 'Large', 550, 200, 'Loyal protector, needs active home. Trained.', 'https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?w=500'),
      ('Luna', '1 year', 'Beagle', 'Female', 'Small', 400, 200, 'Playful puppy, great with other dogs.', 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=500'),
      ('Charlie', '4 years', 'Cocker Spaniel', 'Male', 'Medium', 500, 200, 'Gentle and affectionate, house trained.', 'https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=500')
    `);
  }
  console.log('DB Ready');
}
initDB();

// Routes
app.get('/api/dogs', async (req,res)=>{
  const r = await pool.query('SELECT * FROM dogs ORDER BY id');
  res.json(r.rows);
});

app.post('/api/apply', async (req,res)=>{
  const { dog_id, name, email, phone, address, experience, home_type } = req.body;
  await pool.query(`INSERT INTO applications (dog_id,name,email,phone,address,experience,home_type) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [dog_id,name,email,phone,address,experience,home_type]);
  res.json({success:true, message: 'Application received! We will contact you. Deposit: £200 required to reserve.'});
});

app.get('/', (req,res)=>{
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Second Chance Paws Rescue - UK</title>
<style>
body{font-family:Arial; margin:0; background:#fef9f3;}
header{background:#ff6b35; color:white; padding:20px; text-align:center;}
.card{background:white; margin:15px; border-radius:12px; padding:15px; box-shadow:0 2px 8px #0001;}
img{width:100%; border-radius:10px; height:220px; object-fit:cover;}
.fee{color:#ff6b35; font-weight:bold; font-size:18px;}
.btn{background:#ff6b35; color:white; padding:10px 20px; border:none; border-radius:8px; cursor:pointer; width:100%; margin-top:10px;}
.deposit{background:#fff3cd; padding:8px; border-radius:6px; margin:5px 0;}
</style>
</head>
<body>
<header>
<h1>🐾 Second Chance Paws Rescue</h1>
<p>UK Registered Rescue - Adopt Don't Shop</p>
<p>Adoption Fees £400-£550 + £200 Reservation Deposit</p>
</header>
<div id="dogs"></div>
<script>
async function load(){
  const r = await fetch('/api/dogs'); const dogs = await r.json();
  document.getElementById('dogs').innerHTML = dogs.map(d=>`
    <div class="card">
      <img src="\${d.image_url}">
      <h2>\${d.name} - \${d.breed}</h2>
      <p>\${d.age} | \${d.gender} | \${d.size} | \${d.status}</p>
      <p class="fee">Adoption Fee: £\${d.fee}</p>
      <div class="deposit">🔒 Reservation Deposit: £\${d.deposit} (deducted from fee, required to reserve)</div>
      <p>\${d.description}</p>
      <p><b>Total to Adopt:</b> £\${d.fee} (includes £\${d.deposit} deposit + £\${d.fee - d.deposit} on collection)</p>
      <button class="btn" onclick="apply(\${d.id},'\${d.name}')">Apply to Adopt \${d.name}</button>
    </div>
  `).join('');
}
function apply(id,name){
  const n=prompt('Your full name for '+name+':'); if(!n) return;
  const e=prompt('Your email:'); if(!e) return;
  const p=prompt('Phone:'); if(!p) return;
  fetch('/api/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dog_id:id,name:n,email:e,phone:p,address:'UK',experience:'',home_type:''})}).then(()=>alert('Application sent for '+name+'!\\n\\nDeposit Info:\\n£200 to reserve. Remaining £'+ (id) +' due on adoption day. We will email you payment details at '+e));
}
load();
</script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log('Live on '+PORT));
