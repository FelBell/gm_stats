from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Round(db.Model):
    __tablename__ = 'rounds'
    id = db.Column(db.String(36), primary_key=True)
    map_name = db.Column(db.String(128))
    winner = db.Column(db.String(64)) # e.g., 'traitors', 'innocents', 'timelimit'
    duration = db.Column(db.Integer) # in seconds
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    kills = db.relationship('Kill', backref='round', lazy=True)
    players = db.relationship('RoundPlayer', backref='round', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'map_name': self.map_name,
            'winner': self.winner,
            'duration': self.duration,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'kills': [k.to_dict() for k in self.kills],
            'players': [p.to_dict() for p in self.players]
        }

class RoundPlayer(db.Model):
    __tablename__ = 'round_players'
    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(db.String(36), db.ForeignKey('rounds.id'), nullable=False)
    steam_id = db.Column(db.String(64), nullable=False)
    role_start = db.Column(db.String(32))
    role_end = db.Column(db.String(32))

    def to_dict(self):
        return {
            'steam_id': self.steam_id,
            'role_start': self.role_start,
            'role_end': self.role_end
        }

class Kill(db.Model):
    __tablename__ = 'kills'
    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(db.String(36), db.ForeignKey('rounds.id'), nullable=False)

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
