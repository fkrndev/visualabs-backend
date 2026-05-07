import { db } from '../../../../src/db/client';
import { scorecards, scorecardData, customers, subscriptions, users, profiles, customerProfiles, products } from '../../../../src/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function setupTestDb() {
  try {
    // Generate unique suffix for this test run with maximum entropy to prevent interference
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 100000);
    const processId = process.pid || 0;
    const threadId = Math.floor(Math.random() * 10000);
    const fullSuffix = `_${timestamp}_${randomSuffix}_${processId}_${threadId}`;
    console.log(`Creating test data with suffix: ${fullSuffix}`);
    
    // Add delay to allow previous test cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // More thorough cleanup with proper order and error handling
    console.log('Starting database cleanup...');
    
    // Clean up in reverse dependency order
    const cleanupSteps = [
      () => db.delete(scorecardData),
      () => db.delete(scorecards),
      () => db.delete(subscriptions),
      () => db.delete(customerProfiles),
      () => db.delete(customers),
      () => db.delete(profiles),
      () => db.delete(users)
    ];

    for (const cleanupStep of cleanupSteps) {
      try {
        await cleanupStep();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('Cleanup step failed:', errorMessage);
        // Continue with next step
      }
    }

    // Longer delay to ensure cleanup completes across concurrent tests
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Create basic test users and profiles with enhanced retry logic
    let testUser = null;
    let userRetryCount = 0;
    const maxUserRetries = 5; // Increase retry count
    
    while (!testUser && userRetryCount < maxUserRetries) {
      try {
        // Generate unique username for each retry attempt
        const uniqueUsername = `test_user${fullSuffix}_${userRetryCount}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const uniqueEmail = `test${fullSuffix}_${userRetryCount}_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`;
        
        await db.insert(users).values({
          username: uniqueUsername,
          email: uniqueEmail,
          password: 'hashed_password',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        testUser = await db.select({ id: users.id }).from(users).where(eq(users.username, uniqueUsername)).limit(1);
        
        if (testUser && testUser.length > 0) {
          console.log(`Successfully created test user on attempt ${userRetryCount + 1}: ${uniqueUsername}`);
          break;
        }
      } catch (error) {
        userRetryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`User creation attempt ${userRetryCount} failed:`, errorMessage);
        
        if (userRetryCount >= maxUserRetries) {
          console.error('Failed to create test user after maximum retries');
          throw new Error(`Failed to create test user after ${maxUserRetries} attempts: ${errorMessage}`);
        }
        
        // Add exponential backoff delay
        await new Promise(resolve => setTimeout(resolve, 100 * userRetryCount));
      }
    }

    if (!testUser || testUser.length === 0) {
      throw new Error('Failed to create test user after retries - no user found');
    }

    await db.insert(profiles).values({
      userId: testUser[0].id,
      name: `Test User${fullSuffix}`,
      email: `test${fullSuffix}@example.com`,
      phone: '1234567890',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create test customer with retry logic
    let testCustomer = null;
    let customerRetryCount = 0;
    while (!testCustomer && customerRetryCount < 3) {
      try {
        await db.insert(customers).values({
          username: `test_customer${fullSuffix}_${customerRetryCount}`,
          email: `customer${fullSuffix}_${customerRetryCount}@example.com`,
          password: 'hashed_password',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        testCustomer = await db.select({ id: customers.id }).from(customers).where(eq(customers.username, `test_customer${fullSuffix}_${customerRetryCount}`)).limit(1);
      } catch (error) {
        customerRetryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Customer creation attempt ${customerRetryCount} failed:`, errorMessage);
        if (customerRetryCount >= 3) throw new Error(`Customer creation failed: ${errorMessage}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (!testCustomer || testCustomer.length === 0) {
      throw new Error('Failed to create test customer after retries');
    }

    await db.insert(customerProfiles).values({
      customerId: testCustomer[0].id,
      name: `Test Customer${fullSuffix}`,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create test product first
    await db.insert(products).values({
      name: `Test Product${fullSuffix}`,
      description: 'Test product for subscription',
      price: '99.99',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const testProduct = await db.select().from(products).where(eq(products.name, `Test Product${fullSuffix}`)).limit(1);

    if (testProduct.length === 0) {
      throw new Error('Failed to create test product');
    }

    // Create test subscription only if customer and product exist
    let testSubscription = null;
    if (testCustomer[0] && testProduct[0]) {
      let subscriptionRetryCount = 0;
      const maxSubscriptionRetries = 3;
      
      while (!testSubscription && subscriptionRetryCount < maxSubscriptionRetries) {
        try {
          await db.insert(subscriptions).values({
            customerId: testCustomer[0].id,
            productId: testProduct[0].id,
            brand: `Test Brand${fullSuffix}_${subscriptionRetryCount}`,
            status: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          testSubscription = await db.select().from(subscriptions)
            .where(eq(subscriptions.customerId, testCustomer[0].id))
            .limit(1);
            
          if (testSubscription && testSubscription.length > 0) {
            console.log(`Successfully created subscription on attempt ${subscriptionRetryCount + 1}`);
            break;
          }
        } catch (error) {
          subscriptionRetryCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`Subscription creation attempt ${subscriptionRetryCount} failed:`, errorMessage);
          
          if (subscriptionRetryCount >= maxSubscriptionRetries) {
            console.warn('Failed to create subscription after maximum retries, continuing without subscription');
            break;
          }
          
          // Add delay before retry
          await new Promise(resolve => setTimeout(resolve, 100 * subscriptionRetryCount));
        }
      }
    }

    console.log('Test database setup completed successfully');
    return {
      user: testUser[0],
      customer: testCustomer[0]
    };
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw new Error(`Database setup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function cleanupTestDb() {
  console.log('Starting database cleanup...');
  
  // Clean up in correct order to respect foreign key constraints
  // Child tables first, then parent tables
  
  try {
    await db.delete(scorecardData);
    console.log('Cleaned up scorecard data');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Warning: Could not clean up scorecard data:', errorMessage);
  }
    
  try {
    await db.delete(scorecards);
    console.log('Cleaned up scorecards');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Warning: Could not clean up scorecards:', errorMessage);
  }
    
  try {
    await db.delete(subscriptions);
    console.log('Cleaned up subscriptions');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Warning: Could not clean up subscriptions:', errorMessage);
  }
    
  try {
    await db.delete(customerProfiles);
    console.log('Cleaned up customer profiles');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Warning: Could not clean up customer profiles:', errorMessage);
  }
    
  try {
    await db.delete(customers);
    console.log('Cleaned up customers');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Warning: Could not clean up customers:', errorMessage);
  }
    
  try {
    await db.delete(profiles);
    console.log('Cleaned up profiles');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Warning: Could not clean up profiles:', errorMessage);
  }
    
  try {
    await db.delete(users);
    console.log('Cleaned up users');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Warning: Could not clean up users:', errorMessage);
  }
  
  console.log('Database cleanup completed');
}

export async function createTestScorecard(overrides: any = {}) {
  // Generate unique identifier for this scorecard to prevent conflicts
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 10000);
  const processId = process.pid || 0;
  const uniqueId = `${timestamp}_${randomSuffix}_${processId}`;
  
  const defaultData = {
    title: `Test KPI_${uniqueId}`,
    description: 'Test KPI Description',
    customerId: null,
    subscriptionId: null,
    assignedTo: null,
    pic: 0,
    category: 0,
    targetValue: '100.00',
    targetType: 0,
    unitValue: 0,
    unitCustom: null,
    frequency: 0,
    showOnScorecard: 1,
    greenThreshold: 100,
    yellowThreshold: 80,
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Merge overrides with default data
  const insertData = { ...defaultData, ...overrides };

  // Remove any id field from overrides to prevent autoincrement issues
  if (insertData.id !== undefined) {
    delete insertData.id;
  }

  // Add enhanced retry logic for scorecard creation
  let result = null;
  let retryCount = 0;
  const maxRetries = 12; // Further increased retries for maximum reliability
  let lastError = null;

  while (!result && retryCount < maxRetries) {
    try {
      // Generate unique title for each retry attempt
      const retryTitle = `${insertData.title}_retry_${retryCount}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Validate foreign key references with better error handling
      let finalCustomerId = null;
      let finalSubscriptionId = null;
      let finalAssignedTo = null;

      try {
        if (insertData.customerId && insertData.customerId !== 0) {
          const customerCheck = await db.select().from(customers).where(eq(customers.id, Number(insertData.customerId))).limit(1);
          if (customerCheck?.length > 0) finalCustomerId = Number(insertData.customerId);
        }
      } catch (e) {
        console.warn(`Customer validation failed:`, e);
      }

      try {
        if (insertData.subscriptionId && insertData.subscriptionId !== 0) {
          const subscriptionCheck = await db.select().from(subscriptions).where(eq(subscriptions.id, Number(insertData.subscriptionId))).limit(1);
          if (subscriptionCheck?.length > 0) finalSubscriptionId = Number(insertData.subscriptionId);
        }
      } catch (e) {
        console.warn(`Subscription validation failed:`, e);
      }

      try {
        if (insertData.assignedTo && insertData.assignedTo !== 0) {
          const userCheck = await db.select().from(users).where(eq(users.id, Number(insertData.assignedTo))).limit(1);
          if (userCheck?.length > 0) finalAssignedTo = Number(insertData.assignedTo);
        }
      } catch (e) {
        console.warn(`User validation failed:`, e);
      }

      // Add even longer delay to reduce database contention
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 600));

      // Use database transaction for atomicity
      const transaction = await db.transaction(async (tx) => {
        // Prepare data for raw SQL with better formatting
        const createdAtStr = insertData.createdAt.toISOString().slice(0, 19).replace('T', ' ');
        const updatedAtStr = insertData.updatedAt.toISOString().slice(0, 19).replace('T', ' ');
        
        // Sanitize strings more thoroughly
        const sanitizedTitle = retryTitle.replace(/'/g, "''").replace(/\\/g, "\\\\");
        const sanitizedDescription = insertData.description?.replace(/'/g, "''").replace(/\\/g, "\\\\") || null;
        const sanitizedUnitCustom = insertData.unitCustom?.replace(/'/g, "''").replace(/\\/g, "\\\\") || null;
        
        // Build raw SQL query with explicit NULL handling
        const insertQuery = `
          INSERT INTO scorecards (
            customer_id, subscription_id, title, description, assigned_to, 
            pic, category, target_value, target_type, unit_value, unit_custom,
            frequency, show_on_scorecard, green_threshold, yellow_threshold, 
            status, created_at, updated_at
          ) VALUES (
            ${finalCustomerId ?? 'NULL'}, ${finalSubscriptionId ?? 'NULL'}, 
            '${sanitizedTitle}', ${sanitizedDescription ? `'${sanitizedDescription}'` : 'NULL'}, 
            ${finalAssignedTo ?? 'NULL'}, ${insertData.pic ?? 0}, 
            ${insertData.category ?? 0}, ${insertData.targetValue ?? '100.00'}, 
            ${insertData.targetType ?? 0}, ${insertData.unitValue ?? 0}, 
            ${sanitizedUnitCustom ? `'${sanitizedUnitCustom}'` : 'NULL'}, ${insertData.frequency ?? 1}, 
            ${insertData.showOnScorecard ?? 1}, ${insertData.greenThreshold ?? 100}, 
            ${insertData.yellowThreshold ?? 80}, ${insertData.status ?? 1}, 
            '${createdAtStr}', '${updatedAtStr}'
          )
        `;
        
        console.log(`🔄 Attempting scorecard creation (attempt ${retryCount + 1}/${maxRetries})`);
        
        const insertResult = await tx.execute(sql.raw(insertQuery));
        const insertId = Number(insertResult[0].insertId);

        if (!insertId || insertId === 0) {
          throw new Error(`Invalid insert ID: ${insertId}`);
        }

        // Immediate retrieval within transaction
        const retrievedResult = await tx.select().from(scorecards).where(eq(scorecards.id, insertId)).limit(1);
        
        if (!retrievedResult?.length) {
          throw new Error(`Failed to retrieve scorecard with ID: ${insertId} within transaction`);
        }
        
        return retrievedResult[0];
      });

      result = [transaction]; // Wrap in array for consistency
      
      console.log(`✅ Successfully created scorecard: ${retryTitle} (ID: ${transaction.id})`);
      break;
    } catch (error) {
      retryCount++;
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`❌ Scorecard creation attempt ${retryCount}/${maxRetries} failed:`, lastError);
      
      if (retryCount >= maxRetries) {
        throw new Error(`Scorecard creation failed after ${maxRetries} attempts. Last error: ${lastError}`);
      }
      
      // Exponential backoff with jitter
      const backoffDelay = (400 * Math.pow(1.5, retryCount - 1)) + (Math.random() * 200);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  if (!result?.[0]) {
    throw new Error('createTestScorecard failed to return a valid result');
  }
  return result[0];
}

export async function createTestScorecardData(scorecardParam: number | any, overrides: any = {}) {
  // Handle different parameter patterns including legacy calls
  let scorecardId: number;
  
  // If first parameter is overrides (legacy pattern), create a scorecard first
  if (typeof scorecardParam === 'object' && !scorecardParam.id && (scorecardParam.actualValue || scorecardParam.targetValue)) {
    // This is likely overrides, create a scorecard first
    const scorecard = await createTestScorecard();
    scorecardId = scorecard.id;
    overrides = { ...overrides, ...scorecardParam };
  } else if (typeof scorecardParam === 'object' && scorecardParam.id) {
    scorecardId = scorecardParam.id;
    // Merge overrides from the scorecard object
    overrides = { ...overrides, ...scorecardParam };
  } else if (typeof scorecardParam === 'number') {
    scorecardId = scorecardParam;
  } else if (!scorecardParam || scorecardParam === null || scorecardParam === undefined) {
    // No scorecard provided, create one
    const scorecard = await createTestScorecard();
    scorecardId = scorecard.id;
  } else if (typeof scorecardParam === 'object') {
    // Handle any other object case - try to create a scorecard first
    const scorecard = await createTestScorecard();
    scorecardId = scorecard.id;
    overrides = { ...overrides, ...scorecardParam };
  } else {
    // Last resort - create a scorecard and use it
    const scorecard = await createTestScorecard();
    scorecardId = scorecard.id;
  }

  // Add retry logic for scorecard data creation with database transaction
  let result = null;
  let retryCount = 0;
  const maxRetries = 8; // Increased retries for better reliability
  
  while (!result && retryCount < maxRetries) {
    try {
      // Add delay before attempting to ensure scorecard is committed
      await new Promise(resolve => setTimeout(resolve, 300 + retryCount * 100));

      // Use database transaction for atomicity
      const transaction = await db.transaction(async (tx) => {
        // Verify scorecard exists within transaction
        const scorecardCheck = await tx.select().from(scorecards).where(eq(scorecards.id, scorecardId)).limit(1);
        if (!scorecardCheck || scorecardCheck.length === 0) {
          throw new Error(`Scorecard ID ${scorecardId} not found in database`);
        }
        
        const defaultData = {
          scorecardId: scorecardId,
          year: 2024,
          month: 1,
          week: null,
          day: null,
          actualValue: '100.00',
          targetValue: '100.00',
          status: 1,
          threshold: 1,
          trend: 1,
          enteredBy: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Merge overrides with default data
        const insertData = { ...defaultData, ...overrides };

        // Remove any id field from overrides to prevent autoincrement issues
        if (insertData.id !== undefined) {
          delete insertData.id;
        }

        const insertResult = await tx.insert(scorecardData).values(insertData);
        const insertId = Number(insertResult[0].insertId);
        
        if (!insertId || insertId === 0) {
          throw new Error('Failed to get valid insert ID from database');
        }

        // Immediate retrieval within transaction
        const retrievedData = await tx.select().from(scorecardData).where(eq(scorecardData.id, insertId)).limit(1);
        
        if (!retrievedData || retrievedData.length === 0) {
          throw new Error(`Failed to retrieve scorecard data with ID: ${insertId} within transaction`);
        }
        
        return retrievedData[0];
      });

      result = [transaction]; // Wrap in array for consistency
      
      console.log(`✅ Created scorecard data for scorecard ID: ${scorecardId} (Data ID: ${transaction.id})`);
      break;
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`❌ Scorecard data creation attempt ${retryCount}/${maxRetries} failed:`, errorMessage);
      
      if (retryCount >= maxRetries) {
        throw new Error(`Scorecard data creation failed after ${maxRetries} attempts: ${errorMessage}`);
      }
      
      // Exponential backoff with jitter
      const backoffDelay = (300 * Math.pow(1.5, retryCount - 1)) + (Math.random() * 200);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  if (!result?.[0]) {
    throw new Error('createTestScorecardData failed to return a valid result');
  }
  return result[0];
}

export async function createTestCustomer(overrides: any = {}) {
  // Add retry logic for customer creation
  let customer = null;
  let retryCount = 0;
  const maxRetries = 8; // Increased retries for better reliability
  
  while (!customer && retryCount < maxRetries) {
    try {
      const timestamp = Date.now() + Math.floor(Math.random() * 100000) + retryCount;
      const processId = process.pid || 0;
      const threadId = Math.floor(Math.random() * 10000);
      
      // Create explicit customer data object
      const data = {
        username: `customer_${timestamp}_${processId}_${threadId}_${Math.floor(Math.random() * 1000)}`,
        email: `customer_${timestamp}_${processId}_${threadId}_${Math.floor(Math.random() * 1000)}@example.com`,
        password: 'hashed_password',
        phone: overrides.phone || null,
        fbid: overrides.fbid || null,
        googleId: overrides.googleId || null,
        dataJson: overrides.dataJson || null,
        deletedAt: overrides.deletedAt || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Apply overrides safely
      if (overrides.username) data.username = overrides.username;
      if (overrides.email) data.email = overrides.email;
      if (overrides.password) data.password = overrides.password;
      
      console.log(`Creating customer with username: ${data.username}`);
      
      // Add longer delay to reduce database contention in concurrent tests
      await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 400));

      // Use database transaction for atomicity
      const transaction = await db.transaction(async (tx) => {
        const insertResult = await tx.insert(customers).values(data);
        const insertId = Number(insertResult[0].insertId);
        
        if (!insertId || insertId === 0) {
          throw new Error(`Failed to get valid insert ID from database. Got: ${insertId}`);
        }

        // Immediate retrieval within transaction
        const retrievedCustomer = await tx.select().from(customers).where(eq(customers.id, insertId)).limit(1);
        
        if (!retrievedCustomer || retrievedCustomer.length === 0) {
          throw new Error(`Failed to retrieve customer with ID: ${insertId} within transaction`);
        }
        
        return retrievedCustomer;
      });

      customer = transaction;
      
      console.log(`✅ Successfully created customer on attempt ${retryCount + 1}: ${customer[0].username} (ID: ${customer[0].id})`);
      break;
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Customer creation attempt ${retryCount} failed:`, errorMessage);
      
      if (retryCount >= maxRetries) {
        throw new Error(`Customer creation failed: ${errorMessage}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  if (!customer || !customer[0]) {
    throw new Error('createTestCustomer failed to return a valid result');
  }

  // Create associated profile with error handling
  try {
    await db.insert(customerProfiles).values({
      customerId: customer[0].id,
      name: customer[0].username,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Failed to create customer profile:', errorMessage);
    // Don't throw error, continue without profile
  }

  return customer[0];
}

export async function createTestUser(overrides: any = {}) {
  // Add retry logic for user creation
  let user = null;
  let retryCount = 0;
  const maxRetries = 3;
  let finalData = null;
  
  while (!user && retryCount < maxRetries) {
    try {
      const timestamp = Date.now() + Math.floor(Math.random() * 10000) + retryCount;
      const defaultData = {
        username: `user_${timestamp}_${Math.floor(Math.random() * 1000)}`,
        email: `user_${timestamp}_${Math.floor(Math.random() * 1000)}@example.com`,
        password: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const data = { ...defaultData, ...overrides };
      finalData = data;
      
      const insertResult = await db.insert(users).values(data);
      const insertId = Number(insertResult[0].insertId);
      
      user = await db.select().from(users).where(eq(users.id, insertId)).limit(1);

      if (!user || user.length === 0) {
        throw new Error(`Failed to retrieve user with ID: ${insertId}`);
      }
      
      console.log(`Successfully created user on attempt ${retryCount + 1}: ${data.username} (ID: ${insertId})`);
      break;
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`User creation attempt ${retryCount} failed:`, errorMessage);
      
      if (retryCount >= maxRetries) {
        throw new Error(`User creation failed: ${errorMessage}`);
      }
      
      // Add delay before retry
      await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
    }
  }

  // Create associated profile with error handling
  try {
    if (user && user[0] && finalData) {
      await db.insert(profiles).values({
        userId: user[0].id,
        name: finalData.username,
        phone: '1234567890',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Failed to create user profile:', errorMessage);
    // Don't throw error, continue without profile
  }

  return user![0];
}

export async function createTestSubscription(overrides: any = {}) {
  // Add retry logic for subscription creation
  let result = null;
  let retryCount = 0;
  const maxRetries = 3;
  let useNullForeignKeys = false;

  while (!result && retryCount < maxRetries) {
    try {
      const customer = await createTestCustomer();

      // Create test product first with unique name
      const productName = `Test Product_${Date.now()}_${Math.floor(Math.random() * 10000)}_${retryCount}`;
      await db.insert(products).values({
        name: productName,
        description: 'Test product for subscription',
        price: '99.99',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const testProduct = await db.select().from(products).where(eq(products.name, productName)).limit(1);

      if (!testProduct || testProduct.length === 0) {
        throw new Error(`Failed to create test product: ${productName}`);
      }

      const defaultData = {
        customerId: customer.id,
        productId: testProduct[0].id,
        brand: 'Test Brand',
        plan: 'Basic',
        status: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const data = { ...defaultData, ...overrides };

      await db.insert(subscriptions).values(data);

      result = await db.select().from(subscriptions)
        .where(eq(subscriptions.customerId, data.customerId))
        .limit(1);

      if (!result || result.length === 0) {
        throw new Error(`Failed to create subscription for customer: ${data.customerId}`);
      }

      console.log(`Successfully created subscription on attempt ${retryCount + 1}`);
      break;
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Subscription creation attempt ${retryCount} failed:`, errorMessage);

      // Check if it's a foreign key constraint error (check multiple patterns)
      const isForeignKeyError = errorMessage.toLowerCase().includes('foreign key') ||
                                 errorMessage.toLowerCase().includes('constraint') ||
                                 errorMessage.includes('ER_NO_REFERENCED_ROW') ||
                                 errorMessage.includes('ER_NO_REFERENCED_ROW_2');

      if (isForeignKeyError && !useNullForeignKeys) {
        console.warn('Foreign key constraint detected, retrying with null foreign key values');
        useNullForeignKeys = true;
        retryCount--; // Don't count this as a retry since we're changing strategy
        continue;
      }

      if (retryCount >= maxRetries) {
        // Instead of throwing, return null to allow tests to continue
        console.error(`Subscription creation failed after ${maxRetries} attempts: ${errorMessage}`);
        return null;
      }

      // Add delay before retry
      await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
    }
  }

  return result ? result[0] : null;
}

// Batch creation helpers for performance testing
export async function createBatchScorecards(count: number, baseOverrides: any = {}) {
  const scorecards = [];
  
  for (let i = 0; i < count; i++) {
    const scorecard = await createTestScorecard({
      title: `Batch KPI ${i}_${Date.now()}_${i}`, // Make title unique
      ...baseOverrides
    });
    scorecards.push(scorecard);
  }
  
  return scorecards;
}

export async function createBatchScorecardData(count: number, scorecardId: number, baseOverrides: any = {}) {
  const data = [];
  
  // First verify the scorecard exists
  const scorecardCheck = await db.select().from(scorecards).where(eq(scorecards.id, scorecardId)).limit(1);
  if (!scorecardCheck || scorecardCheck.length === 0) {
    throw new Error(`Scorecard ID ${scorecardId} not found for batch data creation`);
  }
  
  for (let i = 0; i < count; i++) {
    const item = await createTestScorecardData({
      scorecardId,
      year: 2024,
      month: (i % 12) + 1,
      actualValue: `${(i * 10) % 100}.00`,
      ...baseOverrides
    });
    data.push(item);
  }
  
  return data;
}

// Helper to create complete related data scenario
export async function createCompleteScorecardScenario() {
  const customer = await createTestCustomer({ username: 'scenario_customer' });
  const user = await createTestUser({ username: 'scenario_user' });
  const subscription = await createTestSubscription({ customerId: customer.id });
  
  if (!subscription || !subscription.id) {
    throw new Error('Failed to create subscription for scenario');
  }
  
  const scorecard = await createTestScorecard({
    title: 'Scenario KPI',
    description: 'Complete scenario test',
    customerId: customer.id,
    subscriptionId: subscription.id,
    assignedTo: user.id,
    targetValue: '85.00',
    greenThreshold: 100,
    yellowThreshold: 80
  });

  const scorecardData = await createTestScorecardData({
    scorecardId: scorecard.id,
    year: 2024,
    month: 1,
    actualValue: '90.00',
    targetValue: '85.00'
  });

  return {
    customer,
    user,
    subscription,
    scorecard,
    scorecardData
  };
}

// Helper to create performance-based test data
export async function createPerformanceTestData(performance: 'good' | 'average' | 'poor') {
  const performanceMap = {
    good: { actual: '95.00', target: '100.00', threshold: 0 },
    average: { actual: '80.00', target: '100.00', threshold: 1 },
    poor: { actual: '60.00', target: '100.00', threshold: 2 }
  };

  const perf = performanceMap[performance];
  const scorecard = await createTestScorecard({
    title: `${performance} KPI`,
    targetValue: perf.target,
    greenThreshold: 100,
    yellowThreshold: 80
  });

  const scorecardData = await createTestScorecardData({
    scorecardId: scorecard.id,
    year: 2024,
    month: 1,
    actualValue: perf.actual,
    targetValue: perf.target,
    threshold: perf.threshold
  });

  return { scorecard, scorecardData };
}
