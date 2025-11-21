import axios from 'axios';
import { EventEmitter } from 'events';

const API_URL = 'https://api.guerrillamail.com/ajax.php';

class TempEmailSession extends EventEmitter {
  constructor(address, sid, seq) {
    super();
    this.address = address;
    this.sid = sid;
    this.seq = seq;
    this.emails = [];
    this.threads = new Map();
    this.isListening = false;
    this.pollingInterval = null;
    this.destroyed = false;
  }

  async fetchEmailBody(emailId, sid) {
    if (this.destroyed) {
      throw new Error('Email session has been destroyed');
    }

    const params = new URLSearchParams({ 
      f: 'fetch_email', 
      email_id: emailId,
      sid_token: sid
    });
    
    try {
      const response = await axios.get(`${API_URL}?${params}`);
      if(emailId != 1) console.log("email: " + response.data);
      return response.data;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async checkInbox() {
    if (this.destroyed) {
      throw new Error('Email session has been destroyed');
    }

    const params = new URLSearchParams({ 
      f: 'check_email', 
      sid_token: this.sid, 
      seq: this.seq 
    });
    
    try {
      const response = await axios.get(`${API_URL}?${params}`);
      const data = response.data;
      const newEmails = data.list || [];
      
      // Process each new email and fetch full body
      for (const email of newEmails) {
        try {
          // Fetch full email details including body
          const fullEmailData = await this.fetchEmailBody(email.mail_id, this.sid);
          
          const emailData = {
            id: email.mail_id,
            from: fullEmailData.mail_from || email.mail_from,
            recipient: fullEmailData.mail_recipient,
            subject: fullEmailData.mail_subject || email.mail_subject,
            body: fullEmailData.mail_body || email.mail_body, // Full HTML body
            excerpt: fullEmailData.mail_excerpt, // Text excerpt
            timestamp: new Date((fullEmailData.mail_timestamp || email.mail_timestamp) * 1000),
            date: fullEmailData.mail_date,
            read: (fullEmailData.mail_read || email.mail_read) === '1',
            contentType: fullEmailData.content_type,
            replyTo: fullEmailData.reply_to,
            size: fullEmailData.mail_size,
            address: this.address
          };

          this.emails.push(emailData);
          
          // Thread emails by normalized subject
          const threadKey = this.normalizeSubject(emailData.subject);
          if (!this.threads.has(threadKey)) {
            this.threads.set(threadKey, []);
          }
          this.threads.get(threadKey).push(emailData);

          // Emit the email event with full data
          this.emit('email', emailData);
        } catch (fetchError) {
          // If fetching full body fails, still process with basic data
          console.warn(`Failed to fetch full body for email ${email.mail_id}:`, fetchError.message);
          
          const basicEmailData = {
            id: email.mail_id,
            from: email.mail_from,
            subject: email.mail_subject,
            body: email.mail_body || '', // May be incomplete
            timestamp: new Date(email.mail_timestamp * 1000),
            read: email.mail_read === '1',
            address: this.address,
            bodyFetchFailed: true
          };

          this.emails.push(basicEmailData);
          
          const threadKey = this.normalizeSubject(basicEmailData.subject);
          if (!this.threads.has(threadKey)) {
            this.threads.set(threadKey, []);
          }
          this.threads.get(threadKey).push(basicEmailData);

          this.emit('email', basicEmailData);
        }
      }

      return newEmails;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  onEmail(callback) {
    if (this.destroyed) {
      throw new Error('Email session has been destroyed');
    }

    this.on('email', callback);
    
    // Start listening automatically when onEmail is called
    if (!this.isListening) {
      this.startListening();
    }

    return this; // Allow chaining
  }

  startListening(interval = 2000) {
    if (this.destroyed) {
      throw new Error('Email session has been destroyed');
    }

    if (this.isListening) {
      return this;
    }

    this.isListening = true;

    const poll = async () => {
      if (!this.isListening || this.destroyed) {
        return;
      }

      try {
        await this.checkInbox();
      } catch (error) {
        this.emit('error', error);
      }

      if (this.isListening && !this.destroyed) {
        this.pollingInterval = setTimeout(poll, interval);
      }
    };

    poll();
    return this;
  }

  stopListening() {
    this.isListening = false;
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
    return this;
  }

  async waitForEmail(criteria = {}, timeout = 60000) {
    if (this.destroyed) {
      throw new Error('Email session has been destroyed');
    }

    const { subject, body, from } = criteria;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeListener('email', emailHandler);
        reject(new Error('Timeout waiting for email'));
      }, timeout);

      const emailHandler = (email) => {
        let matches = true;

        if (subject && !email.subject.toLowerCase().includes(subject.toLowerCase())) {
          matches = false;
        }
        if (body && !email.body.toLowerCase().includes(body.toLowerCase())) {
          matches = false;
        }
        if (from && !email.from.toLowerCase().includes(from.toLowerCase())) {
          matches = false;
        }

        if (matches) {
          clearTimeout(timeoutId);
          this.removeListener('email', emailHandler);
          resolve(email);
        }
      };

      this.on('email', emailHandler);
      
      // Start listening if not already
      if (!this.isListening) {
        this.startListening();
      }
    });
  }

  async getEmailById(emailId) {
    if (this.destroyed) {
      throw new Error('Email session has been destroyed');
    }

    // Check if we already have this email in our local storage
    const existingEmail = this.emails.find(email => email.id === emailId);
    if (existingEmail) {
      return existingEmail;
    }

    // If not found locally, fetch it from the server
    try {
      const fullEmailData = await this.fetchEmailBody(emailId, this.sid);
      
      const emailData = {
        id: fullEmailData.mail_id,
        from: fullEmailData.mail_from,
        recipient: fullEmailData.mail_recipient,
        subject: fullEmailData.mail_subject,
        body: fullEmailData.mail_body,
        excerpt: fullEmailData.mail_excerpt,
        timestamp: new Date(fullEmailData.mail_timestamp * 1000),
        date: fullEmailData.mail_date,
        read: fullEmailData.mail_read === '1',
        contentType: fullEmailData.content_type,
        replyTo: fullEmailData.reply_to,
        size: fullEmailData.mail_size,
        address: this.address
      };

      return emailData;
    } catch (error) {
      throw new Error(`Failed to fetch email with ID ${emailId}: ${error.message}`);
    }
  }

  getThread(subject) {
    if (this.destroyed) {
      throw new Error('Email session has been destroyed');
    }

    const threadKey = this.normalizeSubject(subject);
    return this.threads.get(threadKey) || [];
  }

  getAllEmails() {
    if (this.destroyed) {
      throw new Error('Email session has been destroyed');
    }

    return [...this.emails];
  }

  delete() {
    this.destroyed = true;
    this.stopListening();
    this.removeAllListeners();
    this.emails = [];
    this.threads.clear();
    return true;
  }

  normalizeSubject(subject) {
    return subject
      .replace(/^(re:|fwd:|fw:)\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  toJSON() {
    return {
      address: this.address,
      emailCount: this.emails.length,
      threadCount: this.threads.size,
      isListening: this.isListening,
      destroyed: this.destroyed
    };
  }
}

async function makeTempEmail() {
  const params = new URLSearchParams({ f: 'get_email_address' });
  const response = await axios.get(`${API_URL}?${params}`);
  const data = response.data;
  
  const session = new TempEmailSession(data.email_addr, data.sid_token, data.seq);
  
  // Return a JSON-like object with methods
  return {
    address: session.address,
    sid: session.sid,
    seq: session.seq,
    
    // Methods
    onEmail: (callback) => session.onEmail(callback),
    waitForEmail: (criteria, timeout) => session.waitForEmail(criteria, timeout),
    getThread: (subject) => session.getThread(subject),
    getAllEmails: () => session.getAllEmails(),
    getEmailById: (emailId) => session.getEmailById(emailId),
    fetchEmailBody: (emailId) => session.fetchEmailBody(emailId, session.sid),
    delete: () => session.delete(),
    startListening: (interval) => session.startListening(interval),
    stopListening: () => session.stopListening(),
    checkInbox: () => session.checkInbox(),
    
    // JSON representation
    toJSON: () => session.toJSON(),
    
    // Properties
    get emails() { return session.getAllEmails(); },
    get isListening() { return session.isListening; },
    get destroyed() { return session.destroyed; }
  };
}

// Legacy functions for backward compatibility
async function getNewEmail() {
  const params = new URLSearchParams({ f: 'get_email_address' });
  const response = await axios.get(`${API_URL}?${params}`);
  const data = response.data;
  return {
    address: data.email_addr,
    sid: data.sid_token,
    seq: data.seq
  };
}

async function checkInbox(sid, seq) {
  const params = new URLSearchParams({ f: 'check_email', sid_token: sid, seq: seq });
  const response = await axios.get(`${API_URL}?${params}`);
  const data = response.data;
  return data.list;
}

// New helper function to fetch email body
async function fetchEmailBody(emailId, sid) {
  const params = new URLSearchParams({ f: 'fetch_email', email_id: emailId, sid_token: sid});
  const response = await axios.get(`${API_URL}?${params}`);
  if(emailId != 1) console.log("email: " + response.data);
  return response.data;
}

// Example usage function
async function example() {
  console.log('Creating temporary email...');
  
  const tempEmail = await makeTempEmail();
  console.log(`📧 Email created: ${tempEmail.address}`);
  
  // Set up email listener
  tempEmail.onEmail((email) => {
    console.log(`📨 New email from ${email.from}`);
    console.log(`   Subject: ${email.subject}`);
    console.log(`   Body preview: ${email.body.substring(0, 100)}...`);
    console.log(`   Content type: ${email.contentType}`);
    console.log(`   Size: ${email.size} bytes`);
    if (email.bodyFetchFailed) {
      console.log('   ⚠️  Warning: Full body fetch failed');
    }
  });

  console.log('Listening for emails...');

  try {
    // Wait for a specific email
    const email = await tempEmail.waitForEmail({
      subject: 'welcome'
    }, 30000);
    
    console.log('✅ Found welcome email!');
    console.log('Full email:', email);
    
    // Get thread
    const thread = tempEmail.getThread(email.subject);
    console.log(`📧 Thread has ${thread.length} emails`);
    
    // Demonstrate fetching specific email by ID
    const fetchedEmail = await tempEmail.getEmailById(email.id);
    console.log('📄 Re-fetched email:', fetchedEmail);
    
  } catch (error) {
    console.log('⏰ No email received within timeout');
  }

  // Show current state
  console.log('📊 Current state:', tempEmail.toJSON());
  
  // Clean up
  console.log('🗑️ Deleting email session...');
  tempEmail.delete();
  
  console.log('✅ Done!');
}

export {
  makeTempEmail,
  getNewEmail,
  checkInbox,
  fetchEmailBody,
  example,
  TempEmailSession
};