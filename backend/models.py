from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Round(db.Model):
    __tablename__ = 'rounds'
    id = db.Column(db.Integer, primary_key=True)
    server_id = db.Column(db.String(128), nullable=True) # To distinguish if multiple servers use same DB
    map_name = db.Column(db.String(128))
    winner = db.Column(db.String(64)) # e.g., 'traitors', 'innocents', 'timelimit'
    duration = db.Column(db.Integer) # in seconds
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    kills = db.relationship('Kill', backref='round', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'server_id': self.server_id,
            'map_name': self.map_name,
            'winner': self.winner,
            'duration': self.duration,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'kills': [k.to_dict() for k in self.kills]
        }

class Kill(db.Model):
    __tablename__ = 'kills'
    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(db.Integer, db.ForeignKey('rounds.id'), nullable=False)

    attacker_steamid = db.Column(db.String(64), nullable=True) # Nullable for world deaths
    attacker_role = db.Column(db.String(32), nullable=True)
    victim_steamid = db.Column(db.String(64), nullable=False)
    victim_role = db.Column(db.String(32))
    weapon = db.Column(db.String(64))
    headshot = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'attacker_steamid': self.attacker_steamid,
            'attacker_role': self.attacker_role,
            'victim_steamid': self.victim_steamid,
            'victim_role': self.victim_role,
            'weapon': self.weapon,
            'headshot': self.headshot
        }
