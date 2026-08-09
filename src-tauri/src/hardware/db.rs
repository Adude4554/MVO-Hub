use rusqlite::{Connection, params};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use chrono::Utc;

use super::types::SensorReading;

pub struct HardwareDb {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for HardwareDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HardwareDb").finish_non_exhaustive()
    }
}

impl HardwareDb {
    pub fn new(app_data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        let db_path = app_data_dir.join("hardware.db");
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS hw_sensors (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                subcategory TEXT NOT NULL,
                unit TEXT NOT NULL,
                device_id TEXT NOT NULL,
                device_name TEXT NOT NULL,
                source TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hw_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL,
                value REAL NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (sensor_id) REFERENCES hw_sensors(id)
            );

            CREATE INDEX IF NOT EXISTS idx_readings_sensor_time ON hw_readings(sensor_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_readings_time ON hw_readings(timestamp);

            CREATE TABLE IF NOT EXISTS hw_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                value REAL NOT NULL,
                threshold REAL NOT NULL,
                timestamp TEXT NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (sensor_id) REFERENCES hw_sensors(id)
            );

            CREATE INDEX IF NOT EXISTS idx_alerts_time ON hw_alerts(timestamp);
            CREATE INDEX IF NOT EXISTS idx_alerts_unack ON hw_alerts(acknowledged);"
        ).map_err(|e| e.to_string())?;

        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    pub fn upsert_sensor(&self, reading: &SensorReading) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO hw_sensors (id, name, category, subcategory, unit, device_id, device_name, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                reading.id,
                reading.name,
                reading.category.as_str(),
                reading.subcategory,
                reading.unit.as_str(),
                reading.device_id,
                reading.device_name,
                reading.source,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn insert_reading(&self, reading: &SensorReading) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let timestamp = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO hw_readings (sensor_id, value, timestamp) VALUES (?1, ?2, ?3)",
            params![reading.id, reading.value, timestamp],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn insert_batch_readings(&self, readings: &[SensorReading]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let timestamp = Utc::now().to_rfc3339();
        let mut stmt = conn.prepare(
            "INSERT INTO hw_readings (sensor_id, value, timestamp) VALUES (?1, ?2, ?3)"
        ).map_err(|e| e.to_string())?;
        for reading in readings {
            stmt.execute(params![reading.id, reading.value, &timestamp])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn get_recent_readings(&self, sensor_id: &str, count: usize) -> Result<Vec<(String, f64)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT value, timestamp FROM hw_readings WHERE sensor_id = ?1 ORDER BY timestamp DESC LIMIT ?2"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![sensor_id, count as i64], |row| {
            Ok((row.get::<_, String>(1)?, row.get::<_, f64>(0)?))
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    #[allow(dead_code)]
    pub fn get_readings_in_range(&self, sensor_id: &str, start: &str, end: &str) -> Result<Vec<(String, f64)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT value, timestamp FROM hw_readings WHERE sensor_id = ?1 AND timestamp BETWEEN ?2 AND ?3 ORDER BY timestamp ASC"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![sensor_id, start, end], |row| {
            Ok((row.get::<_, String>(1)?, row.get::<_, f64>(0)?))
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    #[allow(dead_code)]
    pub fn get_latest_readings(&self) -> Result<Vec<SensorReading>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.category, s.subcategory, s.unit, s.device_id, s.device_name, s.source, r.value
             FROM hw_sensors s
             LEFT JOIN hw_readings r ON r.sensor_id = s.id AND r.timestamp = (
                 SELECT MAX(timestamp) FROM hw_readings WHERE sensor_id = s.id
             )"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let category: String = row.get(2)?;
            let subcategory: String = row.get(3)?;
            let unit: String = row.get(4)?;
            let device_id: String = row.get(5)?;
            let device_name: String = row.get(6)?;
            let source: String = row.get(7)?;
            let value: f64 = row.get(8).unwrap_or(0.0);
            Ok(SensorReading {
                id, name, subcategory, device_id, device_name, source, value,
                category: super::types::SensorCategory::from_str(&category),
                unit: super::types::SensorUnit::from_str(&unit),
                timestamp: super::types::now_millis(),
                status: super::types::SensorStatus::Available,
                metadata: None,
            })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn cleanup_old_readings(&self, days: i64) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let cutoff = (Utc::now() - chrono::Duration::days(days)).to_rfc3339();
        let affected = conn.execute(
            "DELETE FROM hw_readings WHERE timestamp < ?1",
            params![cutoff],
        ).map_err(|e| e.to_string())?;
        Ok(affected)
    }
}
