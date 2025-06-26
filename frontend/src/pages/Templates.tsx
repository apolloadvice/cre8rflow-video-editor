
import NavBar from "@/components/NavBar";

const Templates = () => {
  return (
    <div className="flex flex-col min-h-screen bg-cre8r-dark">
      <NavBar />
      <div className="flex-1 container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold">Templates</h1>
        <p className="text-cre8r-gray-300 mt-1 mb-8">
          Browse and use ready-made templates
        </p>
        
        <div className="bg-cre8r-gray-800 rounded-lg p-12 text-center">
          <p className="text-cre8r-gray-300">
            Templates gallery coming soon...
          </p>
        </div>
      </div>
    </div>
  );
};

export default Templates;
