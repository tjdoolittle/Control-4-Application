/* Invented example project so the app has something to show before a real .c4p is opened.
   Every name, address and serial here is made up. */
window.C4_SAMPLE = {
  fileName: 'Sample_Residence.c4p',
  sample: true,
  project: { name: 'Sample Residence', city: 'Example City', timezone: 'America/New_York', projectVersion: '42', osVersion: '3.4.3.727848', uuid: 'sample' },
  rooms: [
    { id: 'r1', name: 'Equipment Rack', floor: 'Basement', building: 'House' },
    { id: 'r2', name: 'Family Room', floor: 'Main', building: 'House' },
    { id: 'r3', name: 'Kitchen', floor: 'Main', building: 'House' },
    { id: 'r4', name: 'Primary Bedroom', floor: 'Upper', building: 'House' }
  ],
  devices: [
    { id: 'd1', name: 'Rack CORE 3', hardwareName: 'Control4 CORE 3', room: 'r1', category: 'Controller', maker: 'Control4', model: 'C4 CORE 3', driverFile: 'control4_core3.c4i', driverVersion: '32', firmware: '', serial: '', control: 'IP', ip: '', zigbee: '', mac: '00:0F:FF:00:00:01', addrNote: 'Primary controller', status: 'online', added: '2024-03-02', proxies: [], flags: [] },
    { id: 'd2', name: 'Rack WattBox', hardwareName: '', room: 'r1', category: 'Power', maker: 'Snap One', model: 'Wattbox', driverFile: 'wattbox.c4i', driverVersion: '34', firmware: '2.10.0.0', serial: '', control: 'IP', ip: '10.0.0.20', zigbee: '', mac: '', addrNote: '', status: 'online', added: '2024-03-02', proxies: [], flags: [] },
    { id: 'd3', name: 'Family Room Receiver', hardwareName: 'Example AVR-500', room: 'r1', category: 'Audio', maker: 'Example Audio', model: 'AVR-500', driverFile: 'receiver_example.c4i', driverVersion: '1.04', firmware: '', serial: '', control: 'IP', ip: '10.0.0.31', zigbee: '', mac: '00:05:00:00:00:31', addrNote: '', status: 'online', added: '2024-03-02', proxies: ['Tuner'], flags: [] },
    { id: 'd4', name: 'Cable Box', hardwareName: '', room: 'r1', category: 'Source', maker: 'Example Cable', model: 'XB-100', driverFile: 'cable_ir_example.c4i', driverVersion: '2', firmware: '', serial: '', control: 'IR', ip: '', zigbee: '', mac: '', addrNote: '', status: '', added: '2024-03-02', proxies: [], flags: [] },
    { id: 'd5', name: 'Streaming Player', hardwareName: '', room: 'r1', category: 'Source', maker: 'Example', model: 'Stream 4K', driverFile: 'streamer.c4z', driverVersion: '151', firmware: '', serial: '', control: 'IP', ip: '10.0.0.31', zigbee: '', mac: '', addrNote: '', status: 'online', added: '2024-05-11', proxies: [], flags: [{ level: 'bad', text: 'IP 10.0.0.31 is used by more than one device' }] },
    { id: 'd6', name: 'Family Room TV', hardwareName: 'Example 75Q', room: 'r2', category: 'Display', maker: 'Example Display', model: '75Q', driverFile: 'tv_ip_example.c4z', driverVersion: '307', firmware: '', serial: '', control: 'IP', ip: '10.0.0.41', zigbee: '', mac: '', addrNote: '', status: 'offline', added: '2024-03-02', proxies: [], flags: [{ level: 'bad', text: 'Reported offline in backup' }] },
    { id: 'd7', name: 'Family Room Remote', hardwareName: '', room: 'r2', category: 'Remote', maker: 'Control4', model: 'SR-260', driverFile: 'control4_sr260.c4i', driverVersion: '25', firmware: '', serial: '', control: 'Zigbee', ip: '', zigbee: '000fff0000000a01', mac: '', addrNote: '', status: 'online', added: '2024-03-02', proxies: [], flags: [] },
    { id: 'd8', name: 'Cans', hardwareName: 'Adaptive Phase Dimmer', room: 'r2', category: 'Lighting', maker: 'Control4', model: 'C4-APD120', driverFile: 'adaptive_phase_dimmer.c4i', driverVersion: '8', firmware: '', serial: '', control: 'Zigbee', ip: '', zigbee: '000fff0000000b01', mac: '', addrNote: '', status: 'online', added: '2024-03-02', proxies: [], flags: [] },
    { id: 'd9', name: 'Island Pendants', hardwareName: 'Keypad Dimmer', room: 'r3', category: 'Lighting', maker: 'Control4', model: 'C4-KD120', driverFile: 'combo_dimmer.c4i', driverVersion: '8', firmware: '', serial: '', control: 'Zigbee', ip: '', zigbee: '000fff0000000b02', mac: '', addrNote: '', status: 'online', added: '2024-03-02', proxies: ['Keypad'], flags: [] },
    { id: 'd10', name: 'Kitchen TV', hardwareName: 'Example 55U', room: 'r3', category: 'Display', maker: 'Example Display', model: '55U', driverFile: 'tv_ir_example.c4i', driverVersion: '1', firmware: '', serial: '', control: 'IR', ip: '', zigbee: '', mac: '', addrNote: '', status: '', added: '2024-03-02', proxies: [], flags: [{ level: 'warn', text: 'IR driver with no IR port bound' }] },
    { id: 'd11', name: 'Bedroom TV', hardwareName: 'Example 65U', room: 'r4', category: 'Display', maker: 'Example Display', model: '65U', driverFile: 'tv_ir_example.c4i', driverVersion: '1', firmware: '', serial: '', control: 'IR', ip: '', zigbee: '', mac: '', addrNote: '', status: '', added: '2024-03-02', proxies: [], flags: [] }
  ],
  services: [
    { id: 's1', name: 'Digital Media', room: 'r1', maker: 'Control4', what: 'Digital Media', file: 'control4_digitalaudio.c4i' },
    { id: 's2', name: 'TuneIn', room: 'r1', maker: 'Control4', what: 'TuneIn', file: 'TuneIn.c4z' },
    { id: 's3', name: 'Netflix (Universal)', room: 'r2', maker: 'Control4', what: 'Netflix', file: 'um_netflix.c4z' }
  ],
  connections: [
    { kind: 'control', classes: ['IR_OUT'], via: '', from: { id: 'd1', name: 'Rack CORE 3', port: 'IR OUT 1' }, to: { id: 'd4', name: 'Cable Box', port: 'IR Sensor' } },
    { kind: 'control', classes: ['IR_OUT'], via: '', from: { id: 'd1', name: 'Rack CORE 3', port: 'IR OUT 2' }, to: { id: 'd11', name: 'Bedroom TV', port: 'IR Sensor' } },
    { kind: 'av', classes: ['HDMI'], via: '', from: { id: 'd4', name: 'Cable Box', port: 'HDMI Out' }, to: { id: 'd3', name: 'Family Room Receiver', port: 'INPUT CBL/SAT' } },
    { kind: 'av', classes: ['HDMI'], via: '', from: { id: 'd5', name: 'Streaming Player', port: 'AV Out' }, to: { id: 'd3', name: 'Family Room Receiver', port: 'INPUT Media Player' } },
    { kind: 'av', classes: ['HDMI'], via: '', from: { id: 'd3', name: 'Family Room Receiver', port: 'HDMI Out' }, to: { id: 'd6', name: 'Family Room TV', port: 'HDMI 1' } }
  ],
  stats: { items: 64, drivers: 30, missingDrivers: [] }
};
