import { insforge } from './server/services/insforge.js';

async function main() {
  console.log('Testing InsForge...');
  const tableName = 'sample_data_table';
  
  // Insert some sample data
  const sampleData = [
    { name: 'John Doe', age: 30, role: 'Admin' },
    { name: 'Jane Smith', age: 25, role: 'User' },
    { name: 'Alice Johnson', age: 28, role: 'Manager' }
  ];

  for (const data of sampleData) {
    console.log(`Inserting:`, data);
    const result = await insforge.database.from(tableName).insert(data);
    if (result.error) {
      console.error('Error inserting:', result.error);
    } else {
      console.log('Success:', result.data);
    }
  }

  // Read back
  const readResult = await insforge.database.from(tableName).select('*');
  console.log('Read Result:', readResult);
}

main().catch(console.error);
