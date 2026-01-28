import os
import sys
import logging
import json

# Add the 'backend' directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from flask import Flask, request, jsonify, abort
from models import db, Round, Kill, RoundPlayer, RoundBuy, Player
from functools import wraps

app = Flask(__name__)

# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///stats.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
API_KEY = os.environ.get('API_KEY', 'changeme')

db.init_app(app)

logging.basicConfig(level=logging.INFO)

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Allow checking via query param or header for flexibility
        key = request.headers.get('X-Api-Key') or request.args.get('api_key')
        if key != API_KEY:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/api/collect', methods=['POST'])
@require_api_key
def collect_stats():
    # Use json.loads(request.data) to accommodate GMod addon's potential missing headers
    try:
        data = json.loads(request.data)
    except Exception as e:
        return jsonify({'error': 'Invalid JSON'}), 400

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    logging.info(f"Received Round UUID: {data.get('round_id')}")

    try:
        new_round = Round(
            id=data.get('round_id'),
            map_name=data.get('map_name'),
            winner=data.get('winner'),
            duration=data.get('duration')
        )
        db.session.add(new_round)

        # Process Roles
        players_dict = {}

        # Start roles
        for p in data.get('start_roles', []):
            sid = p.get('player_steamid')
            if sid:
                players_dict[sid] = {
                    'steam_id': sid,
                    'role_start': p.get('role'),
                    'karma_start': p.get('karma'),
                    'points_start': p.get('points')
                }

        # End roles
        for p in data.get('end_roles', []):
            sid = p.get('player_steamid')
            if sid:
                if sid not in players_dict:
                    players_dict[sid] = {'steam_id': sid}
                players_dict[sid]['role_end'] = p.get('role')
                players_dict[sid]['karma_end'] = p.get('karma')
                players_dict[sid]['points_end'] = p.get('points')

        for p_data in players_dict.values():
            karma_start = p_data.get('karma_start')
            karma_end = p_data.get('karma_end')
            points_start = p_data.get('points_start')
            points_end = p_data.get('points_end')

            karma_diff = None
            if karma_start is not None and karma_end is not None:
                karma_diff = karma_end - karma_start

            points_diff = None
            if points_start is not None and points_end is not None:
                points_diff = points_end - points_start
            new_player = RoundPlayer(
                round_id=new_round.id,
                steam_id=p_data['steam_id'],
                role_start=p_data.get('role_start'),
                role_end=p_data.get('role_end'),
                karma_diff=karma_diff,
                points_diff=points_diff
            )
            db.session.add(new_player)

        # Process Kills
        if 'kills' in data and isinstance(data['kills'], list):
            for k in data['kills']:
                new_kill = Kill(
                    round_id=new_round.id,
                    attacker_steamid=k.get('attacker_steamid'),
                    attacker_role=k.get('attacker_role'),
                    victim_steamid=k.get('victim_steamid'),
                    victim_role=k.get('victim_role'),
                    weapon=k.get('weapon'),
                    headshot=k.get('headshot', False)
                )
                db.session.add(new_kill)

        # Process Buys
        if 'buys' in data and isinstance(data['buys'], list):
            for b in data['buys']:
                new_buy = RoundBuy(
                    round_id=new_round.id,
                    steam_id=b.get('steam_id'),
                    role=b.get('role'),
                    item=b.get('item')
                )
                db.session.add(new_buy)

        db.session.commit()
        return jsonify({'message': 'Stats collected successfully', 'round_id': new_round.id}), 201
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error saving stats: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    # Simple pagination or limit
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)

    rounds = Round.query.order_by(Round.timestamp.desc()).offset(offset).limit(limit).all()
    return jsonify([r.to_dict() for r in rounds])

@app.route('/api/player/update', methods=['POST'])
@require_api_key
def update_player():
    try:
        data = json.loads(request.data)
        steam_id = data.get('steam_id')
        display_name = data.get('display_name')

        if not steam_id or not display_name:
            return jsonify({'error': 'Missing steam_id or display_name'}), 400

        player = Player.query.get(steam_id)
        if player:
            # Update existing player
            player.display_name = display_name
            db.session.commit()
            return jsonify({'message': 'Player updated successfully'}), 200
        else:
            # Create new player
            new_player = Player(steam_id=steam_id, display_name=display_name)
            db.session.add(new_player)
            db.session.commit()
            return jsonify({'message': 'Player created successfully'}), 201
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error updating player: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()
    app.run(host='0.0.0.0', port=5000)
