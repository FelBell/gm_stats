from app import app, db
# Import all models to ensure they are registered with SQLAlchemy before create_all() is called
from models import Player, Round, RoundBuy, RoundPlayer, Kill

if __name__ == "__main__":
    with app.app_context():
        db.drop_all()
        db.create_all()
        print("Database reset successfully.")
