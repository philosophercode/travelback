# Database URL Setup Guide

## Local Development (Docker Compose)

The `docker-compose.yml` file is already configured with default credentials:

- **Host**: `localhost`
- **Port**: `5432`
- **User**: `postgres`
- **Password**: `dev123`
- **Database**: `travelback`

### Format:
```
postgresql://postgres:dev123@localhost:5432/travelback
```

### Steps:

1. **Start PostgreSQL**:
   ```bash
   docker-compose up -d
   ```

2. **Add to your `.env` file**:
   ```bash
   DATABASE_URL=postgresql://postgres:dev123@localhost:5432/travelback
   ```

3. **Verify connection**:
   ```bash
   # Test connection
   psql postgresql://postgres:dev123@localhost:5432/travelback -c "SELECT version();"
   ```

---

## Production (Supabase)

### Get your Supabase Database URL:

1. Go to [supabase.com](https://supabase.com) and sign in
2. Create a new project (or select existing one)
3. Go to **Settings** → **Database**
4. Scroll down to **Connection string** → **URI**
5. Copy the connection string

### Format:
```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### Steps:

1. **Copy the connection string** from Supabase dashboard
2. **Replace `[YOUR-PASSWORD]`** with your actual database password
3. **Add to your `.env` file**:
   ```bash
   DATABASE_URL=postgresql://postgres:your-actual-password@db.xxxxx.supabase.co:5432/postgres
   ```

---

## Production (Other PostgreSQL Providers)

### Railway
1. Create a PostgreSQL service
2. Go to **Variables** tab
3. Copy the `DATABASE_URL` variable

### Render
1. Create a PostgreSQL database
2. Go to **Info** tab
3. Copy the **Internal Database URL** or **External Database URL**

### Heroku
1. Add PostgreSQL addon
2. Run: `heroku config:get DATABASE_URL`

### Self-Hosted PostgreSQL

Format:
```
postgresql://[username]:[password]@[host]:[port]/[database]
```

Example:
```
postgresql://myuser:mypassword@db.example.com:5432/travelback
```

---

## Testing Your Connection

### Using psql:
```bash
psql $DATABASE_URL -c "SELECT version();"
```

### Using Node.js:
```bash
node -e "require('pg').Pool({connectionString: process.env.DATABASE_URL}).query('SELECT NOW()', (err, res) => { console.log(err || res.rows[0]); process.exit(0); })"
```

### Using the app:
The app will automatically test the connection on startup. Check the logs for:
```
Database connection successful
```

---

## Troubleshooting

### Connection Refused
- Make sure PostgreSQL is running: `docker-compose ps`
- Check if port 5432 is available: `lsof -i :5432`

### Authentication Failed
- Verify username/password match your PostgreSQL setup
- For Docker: Check `docker-compose.yml` environment variables

### Database Does Not Exist
- Run: `npm run db:setup` to create the schema
- Or manually: `psql $DATABASE_URL -f src/database/schema.sql`

### SSL Required (Production)
Some providers require SSL. Add `?sslmode=require`:
```
DATABASE_URL=postgresql://...?sslmode=require
```

