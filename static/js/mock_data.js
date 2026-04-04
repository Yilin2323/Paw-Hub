// ===== USER - Owner =====
const user = {
    name: "Jordan",
    role: "Pet Owner",
    email: "jordan@email.com",
    phone: "012-3456789",
    gender: "Male",
    my_rating: 4.8
  };
  
  
  // ===== DASHBOARD =====
  const dashboard = {
    totalServices: 12,
  
    applicationStatus: {
      pending: 3,
      approved: 2,
      rejected: 1
    },
  
    serviceTypes: [
      { label: "Pet Sitting", value: 4 },
      { label: "Pet Day Care", value: 2 },
      { label: "Pet Taxi", value: 2 },
      { label: "Pet Training", value: 1 },
      { label: "Dog Walking", value: 3 }
    ]
  };
  
  
  // ===== SERVICES =====
  // Consumed by static/js/owner_services.js (latest = editable listings; upcoming / completed grids)
  const services = {
    latest: [
      {
        id: 1,
        serviceType: "Dog Walking",
        petType: "Dog",
        pets: 2,
        date: "10 June 2026",
        time: "9:00 AM",
        location: "Puchong",
        salary: "RM 30"
      },
      {
        id: 2,
        serviceType: "Pet Training",
        petType: "Cat",
        pets: 1,
        date: "15 June 2026",
        time: "7:00 PM",
        location: "Petaling Jaya",
        salary: "RM 25"
      }
    ],

    upcoming: [
      {
        id: 3,
        serviceType: "Pet Taxi",
        petType: "Cat",
        pets: 1,
        date: "20 June 2026",
        time: "8:00 AM",
        location: "Damansara",
        salary: "RM 100"
      },
      {
        id: 4,
        serviceType: "Pet Day Care",
        petType: "Dog",
        pets: 1,
        date: "18 June 2026",
        time: "8:00 AM – 6:00 PM",
        location: "Subang Jaya",
        salary: "RM 80"
      },

    ],

    completed: [
      {
        id: 5,
        serviceType: "Pet Training",
        petType: "Cat",
        pets: 1,
        date: "25 May 2026",
        time: "4:00 PM",
        location: "Cheras",
        salary: "RM 50"
      },


    ]
  };
  
  
  // ===== APPLICATIONS =====
  const applications = [
    {
      id: 1,
      name: "Amanda Lee",
      gender: "Female",
      age: 22,
      experience: "2 years",
      rating: 4.7,
      service: "Pet Walking",
      status: "Pending",
      description: "Experienced with active dogs."
    },
    {
      id: 2,
      name: "Jason Tan",
      gender: "Male",
      age: 24,
      experience: "3 years",
      rating: 4.9,
      service: "Pet Feeding",
      status: "Approved",
      phone: "012-9876543",
      email: "jason@email.com"
    },
    {
      id: 3,
      name: "Sarah Lim",
      gender: "Female",
      age: 21,
      experience: "1 year",
      rating: 4.3,
      service: "Pet Boarding",
      status: "Rejected",
      description: "Available weekends only."
    }
  ];
  
  
  // ===== NOTIFICATIONS =====
  const notifications = [
    {
      id: 1,
      title: "New application received",
      message: "A sitter applied for your Pet Walking service.",
      time: "2 hours ago",
      read: false
    },
    {
      id: 2,
      title: "Upcoming service reminder",
      message: "Your Pet Feeding service is tomorrow at 7:00 PM.",
      time: "5 hours ago",
      read: false
    },
    {
      id: 3,
      title: "New rating received",
      message: "You received a 5-star rating.",
      time: "1 day ago",
      read: true
    }
  ];
  
  
  // ===== PROFILE =====
  const profile = {
    username: "Jordan",
    email: "jordan@email.com",
    phone: "012-3456789",
    gender: "Male"
  };
// ===== PET CARE TIPS =====

const petCareTips = {
    Dog: [
      "Ensure your dog gets daily exercise such as walking or playtime.",
      "Always provide clean and fresh drinking water.",
      "Maintain a balanced diet suitable for your dog’s age and size.",
      "Schedule regular grooming and health check-ups."
    ],
  
    Cat: [
      "Keep the litter box clean and in a quiet location.",
      "Provide fresh water and a balanced diet daily.",
      "Give your cat a comfortable and warm resting space.",
      "Engage your cat with toys to keep it active."
    ],
  
    Rabbit: [
      "Provide unlimited hay as the main part of their diet.",
      "Keep their cage clean and well-ventilated.",
      "Ensure they are kept in a cool environment.",
      "Allow safe space for movement and exercise."
    ],
  
    Bird: [
      "Clean the cage regularly to maintain hygiene.",
      "Provide fresh food and water daily.",
      "Allow social interaction to prevent loneliness.",
      "Ensure proper lighting and airflow."
    ]
  };
