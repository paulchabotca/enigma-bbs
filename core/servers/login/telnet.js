/* jslint node: true */
'use strict';

//	ENiGMA½
const baseClient		= require('../../client.js');
const Log				= require('../../logger.js').log;
const LoginServerModule	= require('../../login_server_module.js');
const Config			= require('../../config.js').config;

//	deps
const net 			= require('net');
const buffers		= require('buffers');
const binary		= require('binary');
const assert		= require('assert');
const util			= require('util');

//var debug	= require('debug')('telnet');

const ModuleInfo = exports.moduleInfo = {
	name		: 'Telnet',
	desc		: 'Telnet Server',
	author		: 'NuSkooler',
	isSecure	: false,
	packageName	: 'codes.l33t.enigma.telnet.server',
};

//
//	Telnet Protocol Resources
//	* http://pcmicro.com/netfoss/telnet.html
//	* http://mud-dev.wikidot.com/telnet:negotiation
//

/*
	TODO:
	* Document COMMANDS -- add any missing
	* Document OPTIONS -- add any missing
	* Internally handle OPTIONS:
		* Some should be emitted generically
		* Some shoudl be handled internally -- denied, handled, etc. 
		* 

	* Allow term (ttype) to be set by environ sub negotiation

	* Process terms in loop.... research needed

	* Handle will/won't
	* Handle do's, ..
	* Some won't should close connection

	* Options/Commands we don't understand shouldn't crash the server!!


*/

const COMMANDS = {
	SE		: 240,	//	End of Sub-Negotation Parameters
	NOP		: 241,	//	No Operation
	DM		: 242,	//	Data Mark
	BRK		: 243,	//	Break
	IP		: 244,	//	Interrupt Process
	AO		: 245,	//	Abort Output
	AYT		: 246,	//	Are You There?
	EC		: 247,	//	Erase Character
	EL		: 248,	//	Erase Line
	GA		: 249,	//	Go Ahead
	SB		: 250,	//	Start Sub-Negotiation Parameters
	WILL	: 251,	//	
	WONT	: 252,
	DO		: 253,
	DONT	: 254,
	IAC		: 255,	//	(Data Byte)
};

//
//	Resources:
//		* http://www.faqs.org/rfcs/rfc1572.html
//
const SB_COMMANDS = {
	IS		: 0,
	SEND	: 1,
	INFO	: 2,
};

//
//	Telnet Options
//
//	Resources
//		* http://mars.netanya.ac.il/~unesco/cdrom/booklet/HTML/NETWORKING/node300.html
//
const OPTIONS = {
	TRANSMIT_BINARY			: 0,	// http://tools.ietf.org/html/rfc856
	ECHO					: 1,	//	http://tools.ietf.org/html/rfc857
	//	RECONNECTION : 2
	SUPPRESS_GO_AHEAD		: 3,	// aka 'SGA': RFC 858 @ http://tools.ietf.org/html/rfc858
	//APPROX_MESSAGE_SIZE 	: 4
	STATUS					: 5,	// http://tools.ietf.org/html/rfc859
	TIMING_MARK				: 6, // http://tools.ietf.org/html/rfc860
	//RC_TRANS_AND_ECHO		: 7,	//	aka 'RCTE' @ http://www.rfc-base.org/txt/rfc-726.txt
	//OUPUT_LINE_WIDTH		: 8,
	//OUTPUT_PAGE_SIZE		: 9,	//	
	//OUTPUT_CARRIAGE_RETURN_DISP	: 10,	//	RFC 652
	//OUTPUT_HORIZ_TABSTOPS	: 11,	//	RFC 653
	//OUTPUT_HORIZ_TAB_DISP	: 12,	//	RFC 654
	//OUTPUT_FORMFEED_DISP	: 13,	//	RFC 655
	//OUTPUT_VERT_TABSTOPS	: 14,	//	RFC 656
	//OUTPUT_VERT_TAB_DISP	: 15,	//	RFC 657
	//OUTPUT_LF_DISP		: 16,	//	RFC 658
	//EXTENDED_ASCII		: 17,	//	RFC 659
	//LOGOUT				: 18,	//	RFC 727
	//BYTE_MACRO			: 19,	//	RFC 753
	//DATA_ENTRY_TERMINAL	: 20,	//	RFC 1043
	//SUPDUP				: 21,	//	RFC 736
	//SUPDUP_OUTPUT			: 22,	//	RFC 749
	SEND_LOCATION			: 23,	//	RFC 779
	TERMINAL_TYPE			: 24,	//	aka 'TTYPE': RFC 1091 @ http://tools.ietf.org/html/rfc1091
	//END_OF_RECORD			: 25,	//	RFC 885
	//TACACS_USER_ID		: 26,	//	RFC 927
	//OUTPUT_MARKING		: 27,	//	RFC 933
	//TERMINCAL_LOCATION_NUMBER	: 28,	//	RFC 946
	//TELNET_3270_REGIME	: 29,	//	RFC 1041
	WINDOW_SIZE				: 31,	//	aka 'NAWS': RFC 1073 @ http://tools.ietf.org/html/rfc1073
	TERMINAL_SPEED			: 32,	//	RFC 1079 @ http://tools.ietf.org/html/rfc1079
	REMOTE_FLOW_CONTROL		: 33,	//	RFC 1072 @ http://tools.ietf.org/html/rfc1372
	LINEMODE				: 34,	//	RFC 1184 @ http://tools.ietf.org/html/rfc1184
	X_DISPLAY_LOCATION		: 35,	//	aka 'XDISPLOC': RFC 1096 @ http://tools.ietf.org/html/rfc1096
	NEW_ENVIRONMENT_DEP		: 36,	//	aka 'NEW-ENVIRON': RFC 1408 @ http://tools.ietf.org/html/rfc1408 (note: RFC 1572 is an update to this)
	AUTHENTICATION			: 37,	//	RFC 2941 @ http://tools.ietf.org/html/rfc2941
	ENCRYPT					: 38,	//	RFC 2946 @ http://tools.ietf.org/html/rfc2946
	NEW_ENVIRONMENT			: 39,	//	aka 'NEW-ENVIRON': RFC 1572 @ http://tools.ietf.org/html/rfc1572 (note: update to RFC 1408)
	//TN3270E					: 40,	//	RFC 2355
	//XAUTH					: 41,
	//CHARSET				: 42,	//	RFC 2066
	//REMOTE_SERIAL_PORT	: 43,
	//COM_PORT_CONTROL		: 44,	//	RFC 2217
	//SUPRESS_LOCAL_ECHO	: 45,
	//START_TLS				: 46,
	//KERMIT				: 47,	//	RFC 2840
	//SEND_URL				: 48,
	//FORWARD_X				: 49,

	//PRAGMA_LOGON			: 138,
	//SSPI_LOGON			: 139,
	//PRAGMA_HEARTBEAT		: 140

	ARE_YOU_THERE			: 246,	//	aka 'AYT' RFC 854 @ https://tools.ietf.org/html/rfc854

	EXTENDED_OPTIONS_LIST	: 255,	//	RFC 861 (STD 32)
};

//	Commands used within NEW_ENVIRONMENT[_DEP]
const NEW_ENVIRONMENT_COMMANDS = {
	VAR		: 0,
	VALUE	: 1,
	ESC		: 2,
	USERVAR	: 3,
};

const IAC_BUF 		= new Buffer([ COMMANDS.IAC ]);
const IAC_SE_BUF	= new Buffer([ COMMANDS.IAC, COMMANDS.SE ]);

const COMMAND_NAMES = Object.keys(COMMANDS).reduce(function(names, name) {
	names[COMMANDS[name]] = name.toLowerCase();
	return names;
}, {});

const COMMAND_IMPLS = {};
[ 'do', 'dont', 'will', 'wont', 'sb' ].forEach(function(command) {
	const code = COMMANDS[command.toUpperCase()];
	COMMAND_IMPLS[code] = function(bufs, i, event) {
		if(bufs.length < (i + 1)) {
			return MORE_DATA_REQUIRED;
		}
		return parseOption(bufs, i, event);
	};
});

//	:TODO: See TooTallNate's telnet.js: Handle COMMAND_IMPL for IAC in binary mode

//	Create option names such as 'transmit binary' -> OPTIONS.TRANSMIT_BINARY
const OPTION_NAMES = Object.keys(OPTIONS).reduce(function(names, name) {
	names[OPTIONS[name]] = name.toLowerCase().replace(/_/g, ' ');
	return names;
}, {});

const OPTION_IMPLS = {};
//	:TODO: fill in the rest...
OPTION_IMPLS.NO_ARGS						=
OPTION_IMPLS[OPTIONS.ECHO]					= 
OPTION_IMPLS[OPTIONS.STATUS]				=
OPTION_IMPLS[OPTIONS.LINEMODE]				= 
OPTION_IMPLS[OPTIONS.TRANSMIT_BINARY]		=	
OPTION_IMPLS[OPTIONS.AUTHENTICATION]		=
OPTION_IMPLS[OPTIONS.TERMINAL_SPEED]		=
OPTION_IMPLS[OPTIONS.REMOTE_FLOW_CONTROL]	=
OPTION_IMPLS[OPTIONS.X_DISPLAY_LOCATION]	=
OPTION_IMPLS[OPTIONS.SEND_LOCATION]			= 
OPTION_IMPLS[OPTIONS.ARE_YOU_THERE]			=
OPTION_IMPLS[OPTIONS.SUPPRESS_GO_AHEAD]		= function(bufs, i, event) {
	event.buf = bufs.splice(0, i).toBuffer();
	return event;
};

OPTION_IMPLS[OPTIONS.TERMINAL_TYPE] = function(bufs, i, event) {
	if(event.commandCode !== COMMANDS.SB) {
		OPTION_IMPLS.NO_ARGS(bufs, i, event);
	} else {
		//	We need 4 bytes header + data + IAC SE
		if(bufs.length < 7) {
			return MORE_DATA_REQUIRED;
		}

		let end = bufs.indexOf(IAC_SE_BUF, 5);	//	look past header bytes
		if(-1 === end) {
			return MORE_DATA_REQUIRED;
		}

		//	eat up and process the header
		let buf = bufs.splice(0, 4).toBuffer();
		binary.parse(buf)
			.word8('iac1')
			.word8('sb')
			.word8('ttype')
			.word8('is')
			.tap(function(vars) {
				assert(vars.iac1 === COMMANDS.IAC);
				assert(vars.sb === COMMANDS.SB);
				assert(vars.ttype === OPTIONS.TERMINAL_TYPE);
				assert(vars.is === SB_COMMANDS.IS);
			});

		//	eat up the rest
		end -= 4;
		buf = bufs.splice(0, end).toBuffer();

		//
		//	From this point -> |end| is our ttype
		//
		//	Look for trailing NULL(s). Clients such as NetRunner do this.
		//	If none is found, we take the entire buffer
		//
		let trimAt = 0;
		for(; trimAt < buf.length; ++trimAt) {
			if(0x00 === buf[trimAt]) {
				break;
			}
		}

		event.ttype = buf.toString('ascii', 0, trimAt);

		//	pop off the terminating IAC SE
		bufs.splice(0, 2);
	}

	return event;
};

OPTION_IMPLS[OPTIONS.WINDOW_SIZE] = function(bufs, i, event) {
	if(event.commandCode !== COMMANDS.SB) {
		OPTION_IMPLS.NO_ARGS(bufs, i, event);
	} else {
		//	we need 9 bytes
		if(bufs.length < 9) {
			return MORE_DATA_REQUIRED;
		}

		event.buf = bufs.splice(0, 9).toBuffer();
		binary.parse(event.buf)
			.word8('iac1')
			.word8('sb')
			.word8('naws')
			.word16bu('width')
			.word16bu('height')
			.word8('iac2')
			.word8('se')
			.tap(function(vars) {
				assert(vars.iac1 == COMMANDS.IAC);
				assert(vars.sb == COMMANDS.SB);
				assert(vars.naws == OPTIONS.WINDOW_SIZE);
				assert(vars.iac2 == COMMANDS.IAC);
				assert(vars.se == COMMANDS.SE);

				event.cols	= event.columns	= event.width = vars.width;
				event.rows	= event.height = vars.height;
			});		
	}
	return event;
};

//	Build an array of delimiters for parsing NEW_ENVIRONMENT[_DEP]
const NEW_ENVIRONMENT_DELIMITERS = [];
Object.keys(NEW_ENVIRONMENT_COMMANDS).forEach(function onKey(k) {
	NEW_ENVIRONMENT_DELIMITERS.push(NEW_ENVIRONMENT_COMMANDS[k]);
});

//	Handle the deprecated RFC 1408 & the updated RFC 1572:
OPTION_IMPLS[OPTIONS.NEW_ENVIRONMENT_DEP]	=
OPTION_IMPLS[OPTIONS.NEW_ENVIRONMENT]		= function(bufs, i, event) {
	if(event.commandCode !== COMMANDS.SB) {
		OPTION_IMPLS.NO_ARGS(bufs, i, event);
	} else {
		//
		//	We need 4 bytes header + <optional payload> + IAC SE
		//	Many terminals send a empty list:
		//		IAC SB NEW-ENVIRON IS IAC SE
		//
		if(bufs.length < 6) {
			return MORE_DATA_REQUIRED;
		}

		let end = bufs.indexOf(IAC_SE_BUF, 4);	//	look past header bytes
		if(-1 === end) {
			return MORE_DATA_REQUIRED;
		}

		//	eat up and process the header
		let buf = bufs.splice(0, 4).toBuffer();
		binary.parse(buf)
			.word8('iac1')
			.word8('sb')
			.word8('newEnv')
			.word8('isOrInfo')	//	initial=IS, updates=INFO
			.tap(function(vars) {
				assert(vars.iac1 === COMMANDS.IAC);
				assert(vars.sb === COMMANDS.SB);
				assert(vars.newEnv === OPTIONS.NEW_ENVIRONMENT || vars.newEnv === OPTIONS.NEW_ENVIRONMENT_DEP);
				assert(vars.isOrInfo === SB_COMMANDS.IS || vars.isOrInfo === SB_COMMANDS.INFO);

				event.type = vars.isOrInfo;

				if(vars.newEnv === OPTIONS.NEW_ENVIRONMENT_DEP) {
					//	:TODO: bring all this into Telnet class
					Log.log.warn('Handling deprecated RFC 1408 NEW-ENVIRON');
				}
			});

		//	eat up the rest
		end -= 4;
		buf = bufs.splice(0, end).toBuffer();

		//
		//	This part can become messy. The basic spec is:
		//	IAC SB NEW-ENVIRON IS type ... [ VALUE ... ] [ type ... [ VALUE ... ] [ ... ] ] IAC SE
		//
		//	See RFC 1572 @ http://www.faqs.org/rfcs/rfc1572.html
		//
		//	Start by splitting up the remaining buffer. Keep the delimiters
		//	as prefixes we can use for processing.
		//
		//	:TODO: Currently not supporting ESCaped values (ESC + <type>). Probably not really in the wild, but we should be compliant
		//	:TODO: Could probably just convert this to use a regex & handle delims + escaped values... in any case, this is sloppy...
		const params = [];
		let p = 0;
		let j;
		let l;
		for(j = 0, l = buf.length; j < l; ++j) {
			if(NEW_ENVIRONMENT_DELIMITERS.indexOf(buf[j]) === -1) {
				continue;
			}

			params.push(buf.slice(p, j));
			p = j;
		}

		//	remainder
		if(p < l) {
			params.push(buf.slice(p, l));
		}

		let varName;
		event.envVars = {};
		//	:TODO: handle cases where a variable was present in a previous exchange, but missing here...e.g removed
		for(j = 0; j < params.length; ++j) {
			if(params[j].length < 2) {
				continue;	 			
			}

			let cmd = params[j].readUInt8();
			if(cmd === NEW_ENVIRONMENT_COMMANDS.VAR || cmd === NEW_ENVIRONMENT_COMMANDS.USERVAR) {
				varName = params[j].slice(1).toString('utf8');	//	:TODO: what encoding should this really be?
			} else {
				event.envVars[varName] = params[j].slice(1).toString('utf8');	//	:TODO: again, what encoding?
			}
		}

		//	pop off remaining IAC SE
		bufs.splice(0, 2);
	}

	return event;
};

const MORE_DATA_REQUIRED	= 0xfeedface;

function parseBufs(bufs) {
	assert(bufs.length >= 2);
	assert(bufs.get(0) === COMMANDS.IAC);
	return parseCommand(bufs, 1, {});
}

function parseCommand(bufs, i, event) {
	const command		= bufs.get(i);	//	:TODO: fix deprecation... [i] is not the same
	event.commandCode	= command;
	event.command		= COMMAND_NAMES[command];

	const handler = COMMAND_IMPLS[command];
	if(handler) {
		return handler(bufs, i + 1, event);
	} else {
		if(2 !== bufs.length) {
			Log.warn( { bufsLength : bufs.length }, 'Expected bufs length of 2');	//	expected: IAC + COMMAND
		}

		event.buf = bufs.splice(0, 2).toBuffer();
		return event;		
	}
}

function parseOption(bufs, i, event) {
	const option		= bufs.get(i);	//	:TODO: fix deprecation... [i] is not the same
	event.optionCode	= option;
	event.option		= OPTION_NAMES[option];
	return OPTION_IMPLS[option](bufs, i + 1, event);
}


function TelnetClient(input, output) {
	baseClient.Client.apply(this, arguments);

	const self	= this;

	let bufs	= buffers();
	this.bufs	= bufs;

	this.setInputOutput(input, output);

	this.negotiationsComplete	= false;	//	are we in the 'negotiation' phase?
	this.didReady				= false;	//	have we emit the 'ready' event?

	this.subNegotiationState = {
		newEnvironRequested	: false,
	};

	this.setTemporaryDirectDataHandler = function(handler) {
		this.input.removeAllListeners('data');
		this.input.on('data', handler);
	};

	this.restoreDataHandler = function() {
		this.input.removeAllListeners('data');
		this.input.on('data', this.dataHandler);
	};

	this.dataHandler = function(b) {
		bufs.push(b);

		let i;
		while((i = bufs.indexOf(IAC_BUF)) >= 0) {

			//
			//	Some clients will send even IAC separate from data
			//
			if(bufs.length <= (i + 1)) {
				i = MORE_DATA_REQUIRED;
				break;
			}

			assert(bufs.length > (i + 1));
			
			if(i > 0) {
				self.emit('data', bufs.splice(0, i).toBuffer());
			}

			i = parseBufs(bufs);
			
			if(MORE_DATA_REQUIRED === i) {
				break;				
			} else {
				if(i.option) {
					self.emit(i.option, i);	//	"transmit binary", "echo", ...
				}

				self.handleTelnetEvent(i);

				if(i.data) {
					self.emit('data', i.data);
				}
			}
		}

		if(MORE_DATA_REQUIRED !== i && bufs.length > 0) {
			//
			//	Standard data payload. This can still be "non-user" data
			//	such as ANSI control, but we don't handle that here.
			//
			self.emit('data', bufs.splice(0).toBuffer());
		}
	};

	this.input.on('data', this.dataHandler);

	/*
	this.input.on('data', b => {
		bufs.push(b);

		let i;
		while((i = bufs.indexOf(IAC_BUF)) >= 0) {

			//
			//	Some clients will send even IAC separate from data
			//
			if(bufs.length <= (i + 1)) {
				i = MORE_DATA_REQUIRED;
				break;
			}

			assert(bufs.length > (i + 1));
			
			if(i > 0) {
				self.emit('data', bufs.splice(0, i).toBuffer());
			}

			i = parseBufs(bufs);
			
			if(MORE_DATA_REQUIRED === i) {
				break;				
			} else {
				if(i.option) {
					self.emit(i.option, i);	//	"transmit binary", "echo", ...
				}

				self.handleTelnetEvent(i);

				if(i.data) {
					self.emit('data', i.data);
				}
			}
		}

		if(MORE_DATA_REQUIRED !== i && bufs.length > 0) {
			//
			//	Standard data payload. This can still be "non-user" data
			//	such as ANSI control, but we don't handle that here.
			//
			self.emit('data', bufs.splice(0).toBuffer());
		}
	});
	*/

	this.input.on('end', () => {
		self.emit('end');
	});

	this.input.on('error', err => {
		self.log.debug( { err : err }, 'Socket error');
		self.emit('end');
	});

	this.connectionDebug = (info, msg) => {
		if(Config.loginServers.telnet.traceConnections) {
			self.log.trace(info, 'Telnet: ' + msg);
		}
	};
}

util.inherits(TelnetClient, baseClient.Client);

///////////////////////////////////////////////////////////////////////////////
//	Telnet Command/Option handling
///////////////////////////////////////////////////////////////////////////////
TelnetClient.prototype.handleTelnetEvent = function(evt) {
	//	handler name e.g. 'handleWontCommand'
	const handlerName = `handle${evt.command.charAt(0).toUpperCase()}${evt.command.substr(1)}Command`;

	if(this[handlerName]) {
		//	specialized
		this[handlerName](evt);
	} else {
		//	generic-ish
		this.handleMiscCommand(evt);
	}
};

TelnetClient.prototype.handleWillCommand = function(evt) {
	if('terminal type' === evt.option) {
		//
		//	See RFC 1091 @ http://www.faqs.org/rfcs/rfc1091.html
		//
		this.requestTerminalType();	
	} else if('new environment' === evt.option) {
		//
		//	See RFC 1572 @ http://www.faqs.org/rfcs/rfc1572.html
		//
		this.requestNewEnvironment();
	} else {
		//	:TODO: temporary:
		this.connectionDebug(evt, 'WILL');
	}
};

TelnetClient.prototype.handleWontCommand = function(evt) {
	if('new environment' === evt.option) {
		this.dont.new_environment();
	} else {
		this.connectionDebug(evt, 'WONT');
	}
};

TelnetClient.prototype.handleDoCommand = function(evt) {
	//	:TODO: handle the rest, e.g. echo nd the like

	if('linemode' === evt.option) {
		//
		//	Client wants to enable linemode editing. Denied.
		//
		this.wont.linemode();
	} else if('encrypt' === evt.option) {
		//
		//	Client wants to enable encryption. Denied.
		//
		this.wont.encrypt();
	} else {
		//	:TODO: temporary:
		this.connectionDebug(evt, 'DO');
	}
};

TelnetClient.prototype.handleDontCommand = function(evt) {
	this.connectionDebug(evt, 'DONT');
};

TelnetClient.prototype.handleSbCommand = function(evt) {
	const self = this;

	if('terminal type' === evt.option) {
		//
		//	See RFC 1091 @ http://www.faqs.org/rfcs/rfc1091.html
		//
		//	:TODO: According to RFC 1091 @ http://www.faqs.org/rfcs/rfc1091.html
		//	We should keep asking until we see a repeat. From there, determine the best type/etc.
		self.setTermType(evt.ttype);

		self.negotiationsComplete = true;	//	:TODO: throw in a array of what we've taken care. Complete = array satisified or timeout

		if(!self.didReady) {
			self.didReady = true;
			self.emit('ready', { firstMenu : Config.loginServers.telnet.firstMenu } );
		}
	} else if('new environment' === evt.option) {
		//
		//	Handling is as follows:
		//	* Map 'TERM' -> 'termType' and only update if ours is 'unknown'
		//	* Map COLUMNS -> 'termWidth' and only update if ours is 0
		//	* Map ROWS -> 'termHeight' and only update if ours is 0
		//	* Add any new variables, ignore any existing
		//
		Object.keys(evt.envVars || {} ).forEach(function onEnv(name) {
			if('TERM' === name && 'unknown' === self.term.termType) {
				self.setTermType(evt.envVars[name]);
			} else if('COLUMNS' === name && 0 === self.term.termWidth) {
				self.term.termWidth = parseInt(evt.envVars[name]);
				self.clearMciCache();	//	term size changes = invalidate cache
				self.log.debug({ termWidth : self.term.termWidth, source : 'NEW-ENVIRON'}, 'Window width updated');
			} else if('ROWS' === name && 0 === self.term.termHeight) {
				self.term.termHeight = parseInt(evt.envVars[name]);
				self.clearMciCache();	//	term size changes = invalidate cache
				self.log.debug({ termHeight : self.term.termHeight, source : 'NEW-ENVIRON'}, 'Window height updated');
			} else {			
				if(name in self.term.env) {
					assert(
						SB_COMMANDS.INFO === evt.type || SB_COMMANDS.IS === evt.type, 
						'Unexpected type: ' + evt.type);

					self.log.warn(
						{ varName : name, value : evt.envVars[name], existingValue : self.term.env[name] }, 
						'Environment variable already exists');
				} else {
					self.term.env[name] = evt.envVars[name];
					self.log.debug(
						{ varName : name, value : evt.envVars[name] }, 'New environment variable');
				}
			}
		});

	} else if('window size' === evt.option) {
		//
		//	Update termWidth & termHeight.
		//	Set LINES and COLUMNS environment variables as well.
		//
		self.term.termWidth		= evt.width;
		self.term.termHeight	= evt.height;
		
		if(evt.width > 0) {
			self.term.env.COLUMNS = evt.height;
		}

		if(evt.height > 0) {
			self.term.env.ROWS = evt.height;
		}

		self.clearMciCache();	//	term size changes = invalidate cache

		self.log.debug({ termWidth : evt.width , termHeight : evt.height, source : 'NAWS' }, 'Window size updated');
	} else {
		self.log(evt, 'SB');
	}
};

const IGNORED_COMMANDS = [];
[ COMMANDS.EL, COMMANDS.GA, COMMANDS.NOP, COMMANDS.DM, COMMANDS.BRK ].forEach(function onCommandCode(cc) {
	IGNORED_COMMANDS.push(cc);
});


TelnetClient.prototype.handleMiscCommand = function(evt) {
	assert(evt.command !== 'undefined' && evt.command.length > 0);

	//
	//	See:
	//	* RFC 854 @ http://tools.ietf.org/html/rfc854
	//
	if('ip' === evt.command) {
		//	Interrupt Process (IP)
		this.log.debug('Interrupt Process (IP) - Ending');
		
		this.input.end();
	} else if('ayt' === evt.command) {
		this.output.write('\b');
		
		this.log.debug('Are You There (AYT) - Replied "\\b"');
	} else if(IGNORED_COMMANDS.indexOf(evt.commandCode)) {
		this.log.debug({ evt : evt }, 'Ignoring command');
	} else {
		this.log.warn({ evt : evt }, 'Unknown command');
	}
};

TelnetClient.prototype.requestTerminalType = function() {
	const buf = new Buffer( [
		COMMANDS.IAC, 
		COMMANDS.SB, 
		OPTIONS.TERMINAL_TYPE, 
		SB_COMMANDS.SEND, 
		COMMANDS.IAC, 
		COMMANDS.SE ]);
	this.output.write(buf);
};

const WANTED_ENVIRONMENT_VAR_BUFS = [
	new Buffer( 'LINES' ),
	new Buffer( 'COLUMNS' ),
	new Buffer( 'TERM' ),
	new Buffer( 'TERM_PROGRAM' )
];

TelnetClient.prototype.requestNewEnvironment = function() {

	if(this.subNegotiationState.newEnvironRequested) {
		this.log.debug('New environment already requested');
		return;
	}

	const self = this;	

	const bufs = buffers();
	bufs.push(new Buffer( [
		COMMANDS.IAC, 
		COMMANDS.SB, 
		OPTIONS.NEW_ENVIRONMENT, 
		SB_COMMANDS.SEND ]
		));

	for(let i = 0; i < WANTED_ENVIRONMENT_VAR_BUFS.length; ++i) {
		bufs.push(new Buffer( [ NEW_ENVIRONMENT_COMMANDS.VAR ] ), WANTED_ENVIRONMENT_VAR_BUFS[i] );
	}

	bufs.push(new Buffer([ NEW_ENVIRONMENT_COMMANDS.USERVAR, COMMANDS.IAC, COMMANDS.SE ]));

	self.output.write(bufs.toBuffer());

	this.subNegotiationState.newEnvironRequested = true;
};

TelnetClient.prototype.banner = function() {
	this.will.echo();

	this.will.suppress_go_ahead();
	this.do.suppress_go_ahead();

	this.do.transmit_binary();
	this.will.transmit_binary();

	this.do.terminal_type();

	this.do.window_size();
	this.do.new_environment();
};

function Command(command, client) {
	this.command	= COMMANDS[command.toUpperCase()];
	this.client		= client;	
}

//	Create Command objects with echo, transmit_binary, ...
Object.keys(OPTIONS).forEach(function(name) {
	const code = OPTIONS[name];

	Command.prototype[name.toLowerCase()] = function() {
		const buf = new Buffer(3);
		buf[0]	= COMMANDS.IAC;
		buf[1]	= this.command;
		buf[2]	= code;
		return this.client.output.write(buf);
	};
});

//	Create do, dont, etc. methods on Client
['do', 'dont', 'will', 'wont'].forEach(function(command) {
	const get = function() {
		return new Command(command, this);
	};

	Object.defineProperty(TelnetClient.prototype, command, {
		get				: get,
		enumerable		: true,
		configurable	: true
	});
});

exports.getModule = class TelnetServerModule extends LoginServerModule {
	constructor() {
		super();
	}

	createServer() {
		this.server = net.createServer( sock => {
			const client = new TelnetClient(sock, sock);

			client.banner();

			this.handleNewClient(client, sock, ModuleInfo);
		});

		this.server.on('error', err => {
			Log.info( { error : err.message }, 'Telnet server error');
		});
	}

	listen() {
		const port = parseInt(Config.loginServers.telnet.port);
		if(isNaN(port)) {
			Log.error( { server : ModuleInfo.name, port : Config.loginServers.telnet.port }, 'Cannot load server (invalid port)' );
			return false;
		}

		this.server.listen(port);
		Log.info( { server : ModuleInfo.name, port : port }, 'Listening for connections' );
		return true;
	}
};
