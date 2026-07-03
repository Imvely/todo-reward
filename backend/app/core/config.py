"""애플리케이션 설정. 환경변수에서 읽는다 (12-factor)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://todo:todo@localhost:5432/todo_reward"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 2인 앱, 넉넉하게 1일
    cron_secret: str = "dev-cron-secret"  # /internal/* 크론 엔드포인트 보호용


settings = Settings()
