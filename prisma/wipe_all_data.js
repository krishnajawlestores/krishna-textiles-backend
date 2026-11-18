'use strict';

// Keep this entry point so old commands fail safely, without connecting to a DB.
console.error('Database wiping is disabled to protect store data. No data was changed.');
process.exitCode = 1;
