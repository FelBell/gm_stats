from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Round(db.Model):
    """
    Represents a TTT round.

    Attributes:
        id (str): UUIDv4 string serving as the primary key.
        map_name (str): Name of the map played.
        winner (str): Winning team (e.g., 'traitors', 'innocents', 'timelimit').
        duration (int): Duration of the round in seconds.
        timestamp (datetime): UTC timestamp when the round data was recorded.
        kills (List[Kill]): List of kills that occurred during the round.
        players (List[RoundPlayer]): List of players who participated in the round.
    """
    __tablename__ = 'rounds'
    id = db.Column(db.String(36), primary_key=True)
    map_name = db.Column(db.String(128))
    winner = db.Column(db.String(64)) # e.g., 'traitors', 'innocents', 'timelimit'
    duration = db.Column(db.Integer) # in seconds
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    kills = db.relationship('Kill', backref='round', lazy=True)
    players = db.relationship('RoundPlayer', backref='round', lazy=True)
    buys = db.relationship('RoundBuy', backref='round', lazy=True)

    def to_dict(self):
        """Returns a dictionary representation of the Round."""
        return {
            'id': self.id,
            'map_name': self.map_name,
            'winner': self.winner,
            'duration': self.duration,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'kills': [k.to_dict() for k in self.kills],
            'players': [p.to_dict() for p in self.players],
            'buys': [b.to_dict() for b in self.buys]
        }

class RoundBuy(db.Model):
    """
    Represents an equipment buy during a round.

    Attributes:
        id (int): Database ID.
        round_id (str): Foreign key linking to the Round UUID.
        steam_id (str): SteamID of the player who bought the item.
        role (str): Role of the player when they bought the item.
        item (str): The item or weapon identifier bought.
    """
    __tablename__ = 'round_buys'
    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(db.String(36), db.ForeignKey('rounds.id'), nullable=False)
    steam_id = db.Column(db.String(64), nullable=False)
    role = db.Column(db.String(32))
    item = db.Column(db.String(64))

    def to_dict(self):
        """Returns a dictionary representation of the RoundBuy."""
        return {
            'steam_id': self.steam_id,
            'role': self.role,
            'item': self.item
        }

class RoundPlayer(db.Model):
    """
    Represents a player's participation in a round, tracking their start and end roles.

    Attributes:
        id (int): Database ID.
        round_id (str): Foreign key linking to the Round UUID.
        steam_id (str): SteamID of the player.
        role_start (str): Role at the beginning of the round.
        role_end (str): Role at the end of the round.
    """
    __tablename__ = 'round_players'
    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(db.String(36), db.ForeignKey('rounds.id'), nullable=False)
    steam_id = db.Column(db.String(64), nullable=False)
    role_start = db.Column(db.String(32))
    role_end = db.Column(db.String(32))
    karma_diff = db.Column(db.Integer)
    points_diff = db.Column(db.Integer)

    def to_dict(self):
        """Returns a dictionary representation of the RoundPlayer."""
        return {
            'steam_id': self.steam_id,
            'role_start': self.role_start,
            'role_end': self.role_end,
            'karma_diff': self.karma_diff,
            'points_diff': self.points_diff
        }

class Kill(db.Model):
    """
    Represents a kill event during a round.

    Attributes:
        id (int): Database ID.
        round_id (str): Foreign key linking to the Round UUID.
        attacker_steamid (str): SteamID of the attacker (can be None for world deaths).
        attacker_role (str): Role of the attacker.
        victim_steamid (str): SteamID of the victim.
        victim_role (str): Role of the victim.
        weapon (str): Weapon or entity class used for the kill.
        headshot (bool): Whether the kill was a headshot.
    """
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
        """Returns a dictionary representation of the Kill."""
        return {
            'attacker_steamid': self.attacker_steamid,
            'attacker_role': self.attacker_role,
            'victim_steamid': self.victim_steamid,
            'victim_role': self.victim_role,
            'weapon': self.weapon,
            'headshot': self.headshot
        }

class Player(db.Model):
    """
    Represents a unique player.
    Attributes:
        steam_id (str): The player's SteamID, serving as the primary key.
        display_name (str): The player's last known display name.
    """
    __tablename__ = 'players'
    steam_id = db.Column(db.String(64), primary_key=True)
    display_name = db.Column(db.String(128), nullable=False)
    def to_dict(self):
        """Returns a dictionary representation of the Player."""
        return {
            'steam_id': self.steam_id,
            'display_name': self.display_name
        }
