CREATE TABLE IF NOT EXISTS vacancies (
  id SERIAL PRIMARY KEY,
  position JSONB NOT NULL,
  business TEXT NOT NULL,
  business_emoji TEXT,
  branch TEXT NOT NULL,
  slots INT DEFAULT 1,
  salary TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  tg_id BIGINT NOT NULL,
  tg_username TEXT,
  name TEXT NOT NULL,
  birth TEXT,
  district TEXT,
  contact TEXT,
  photo_file_id TEXT,
  voice_file_id TEXT,
  voice_duration INT,
  vacancy_id INT REFERENCES vacancies(id),
  vacancy_label TEXT,
  lang TEXT DEFAULT 'ru',
  status TEXT DEFAULT 'new',
  reviewed_by BIGINT,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_users (
  tg_id BIGINT PRIMARY KEY,
  role TEXT NOT NULL,
  business TEXT,
  branch TEXT,
  active BOOLEAN DEFAULT true,
  added_by BIGINT,
  added_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO vacancies (position, business, business_emoji, branch, slots, salary, active) VALUES
('{"ru":"Кассир","uz":"Kassir"}', 'Lublin', '🍳', 'Tashkent City', 3, '800 000 – 1 200 000 sum', true),
('{"ru":"Администратор","uz":"Administrator"}', 'Scandihome', '🛋', 'Chimgan', 1, '1 000 000 – 1 500 000 sum', true),
('{"ru":"Официант","uz":"Ofitsiant"}', 'Turkish Village', '🫕', 'Hightown', 2, '700 000 – 1 000 000 sum', true)
ON CONFLICT DO NOTHING;
