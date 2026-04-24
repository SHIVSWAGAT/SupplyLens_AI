#!/usr/bin/env python3
import os

import uvicorn

from main import app


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload_enabled = os.getenv("APP_ENV", "development").lower() != "production"
    target = "main:app" if reload_enabled else app
    uvicorn.run(target, host=host, port=port, reload=reload_enabled)


if __name__ == "__main__":
    main()
