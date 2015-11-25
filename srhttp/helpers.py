#!/usr/bin/env python3
# -*- coding: utf-8 -*-

#
# client.py
# Game client for 2015 ETD Winter retreat
# https://github.com/lmccalman/spacerace
#
# Created by Louis Tiao on 28/07/2015.
#

import string
import random
import json
import zmq


# Helper functions
make_control_str = lambda *args: ','.join(args)
make_random_name = lambda length=10: ''.join(random.choice(string.ascii_letters) for _ in range(length))
make_address = 'tcp://{0}:{1}'.format


def make_context():
    context = zmq.Context()
    context.linger = 0
    return context


class Bunch(dict):

    def __init__(self, **kw):
        dict.__init__(self, kw)
        self.__dict__.update(kw)


class Client:

    def __init__(self, hostname, lobby_port, control_port, state_port, context=None):

        if context is None:
            self.context = make_context()
        else:
            self.context = context

        self.lobby = LobbyClient(hostname, lobby_port, self.context)
        self.control = ControlClient(hostname, control_port, self.context)
        self.state = StateClient(hostname, state_port, self.context)

    def close(self):
        self.state.close()
        self.control.close()
        self.lobby.close()


class BaseClient:

    def __init__(self, hostname, port, context=None):

        if context is None:
            self.context = make_context()
        else:
            self.context = context

        addr = make_address(hostname, port)

        self.sock = self.make_socket()

        logger.debug('Connecting to "{}"...'.format(addr))
        self.sock.connect(addr)

    def close(self):
        self.sock.close()


class LobbyClient(BaseClient):

    def make_socket(self):
        return self.context.socket(zmq.REQ) 

    def register(self, ship_name, team_name):

        logger.debug('Registering ship "{}" under team "{}"'.format(ship_name, team_name))
        self.sock.send_json(make_handshake_msg(ship_name, team_name))

        logger.debug('Awaiting response from lobby thread...')
        response = self.sock.recv_json()

        logger.debug('Got "{}"'.format(response))
        return Bunch(**response)


class ControlClient(BaseClient):

    def make_socket(self):
        return self.context.socket(zmq.PUSH)

    def send(self, secret_key, linear, rotational):
        logger.debug('Sending control "{},{},{}"'.format(secret_key, linear, rotational))
        self.sock.send_string(make_control_str(secret_key, linear, rotational))


class StateClient(BaseClient):

    def make_socket(self):
        return self.context.socket(zmq.SUB)

    def subscribe(self, game_name):
        self.sock.setsockopt_string(zmq.SUBSCRIBE, game_name)
        return self

    def recv(self):
        msg_filter_b, msg_b = self.sock.recv_multipart()
        return json.loads(msg_b.decode())

    def state_gen(self):
        while True:
            state_data = self.recv()
            if state_data['state'] == 'finished':
                break
            yield state_data
